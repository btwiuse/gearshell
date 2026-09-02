// notes-store.js — useNotesStore hook: the central state container
// for the Notes plugin. Keeps CRUD actions + derived selectors in
// one place so Sidebar / NoteList / Editor stay pure presentation
// components.
//
// Persistence (notes-storage.js): metadata lives in the per-workspace
// kv store (folders + note index + pin list), note bodies live as
// markdown files under /opfs/home/notes/<folder-slug>/<slug>.md so
// other tools (Files panel, terminal, agents) can read and edit them
// directly. Live-sync listens to two events:
//
//   config.changed (kv) — re-snapshot the index. Bodies in bodyCache
//                          stay valid until fs.changed patches them.
//   fs.changed          — FileSystemObserver on /opfs/home/notes fires
//                          per-file; we patch the matching note's body
//                          in bodyCache and let the editor re-render.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { bridgeAvailable } from "./notes.js";
import {
  NOTES_ROOT,
  KV,
  loadAll,
  persistUpdate,
  persistDelete,
  persistCreateFolder,
  persistRenameFolder,
  persistDeleteFolder,
  createNote as storageCreateNote,
  loadBody,
  notePath,
} from "./notes-storage.js";

export function useNotesStore() {
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [bodyCache, setBodyCache] = useState(() => new Map()); // id -> body string
  const [activeFolderId, setActiveFolderId] = useState("all");
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renamingFolder, setRenamingFolder] = useState(null);
  // Stack-navigation state for narrow viewports. On wide screens
  // (>= 900px) the CSS shows all three panes at once and `view` is
  // effectively a no-op; on narrow screens it drives which pane is
  // visible. Apple Notes on iPhone uses the same stack: sidebar →
  // list → editor, with a back chevron in the toolbar of each
  // pushed view. We persist the previous view in `prevView` so a
  // back press returns to exactly the screen the user came from
  // (e.g. editor → list, never list → sidebar unless they came
  // from sidebar).
  const [view, setView] = useState("list");
  const [prevView, setPrevView] = useState("sidebar");

  // bodiesRef mirrors bodyCache so async file-system handlers can
  // read the latest value without re-binding the effect every time
  // the cache changes (which would churn subscriptions on every save).
  const bodiesRef = useRef(bodyCache);
  useEffect(() => {
    bodiesRef.current = bodyCache;
  }, [bodyCache]);
  // notesRef + foldersRef mirror the index arrays for the same reason
  // — the fs.changed handler closes over the effect's mount-time
  // copies, so without these refs it would never see notes the user
  // created after boot.
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  const foldersRef = useRef(folders);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  const flash = (text, kind = "ok") => {
    setNotice({ text, kind });
    setTimeout(() => setNotice(null), 1800);
  };

  // Navigate to a view, remembering the current one as `prevView`
  // so goBack() returns to it. Used by the narrow-screen stack
  // navigation (back chevrons in NoteList / Editor).
  const goToView = useCallback((next) => {
    setView((curr) => {
      setPrevView(curr);
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    // Pop the stack: the new view is whatever `prevView` says we
    // came from. We use the functional setter for `view` to also
    // swap prevView atomically — `curr` here is the current view
    // (the one being popped), and the new `prevView` becomes that
    // view again (so a subsequent back pops further).
    //
    // Edge case: when the user is on the editor and prevView is
    // somehow null, fall back to "list" so we never strand them on
    // an unrendered view. Reading from the closure is fine because
    // we re-set prevView on every transition — the only way it can
    // be stale is if a sibling effect cleared it.
    setView((curr) => {
      setPrevView(curr);
      const target = prevView && prevView !== curr ? prevView : "list";
      return target;
    });
  }, [prevView]);

  // --- initial boot + live-sync ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await loadAll();
      if (cancelled) return;
      setFolders(state.folders);
      setNotes(state.notes);
      setPinned(state.pinned);
      setBodyCache(state.bodies);
      setLoading(false);
    })();
    if (!bridgeAvailable) return;
    // kv live-sync: re-read the index every time anyone writes. Body
    // bytes stay in bodyCache until fs.changed patches them — that
    // way an external "cat > notes.md" doesn't lose our local edits
    // mid-debounce.
    const reloadKv = async () => {
      const state = await loadAll();
      if (cancelled) return;
      setFolders(state.folders);
      setNotes(state.notes);
      setPinned(state.pinned);
      // Keep existing bodyCache entries; only fill in blanks for new
      // notes so the kv reload doesn't fight the fs watcher.
      setBodyCache((curr) => {
        const next = new Map(curr);
        for (const [id, body] of state.bodies) {
          if (!next.has(id)) next.set(id, body);
        }
        return next;
      });
    };
    // fs live-sync: patch the body cache when an external writer
    // touches a note file. We watch the entire /opfs/home/notes tree
    // once per panel; events fire per-file. Chrome delivers batches
    // (one cb call per microtask) and the workspace-fs-api layer has
    // already expanded each batch into individual events for us.
    let watchHandle = null;
    const reloadFs = async (payload) => {
      if (!payload || !payload.path) return;
      // We only care about writes inside the notes tree. Watch for
      // both note bodies ("appeared"/"modified") and folder-shaping
      // events; reloadKv handles folder metadata when the user just
      // renamed via the shell.
      if (!payload.path.startsWith(NOTES_ROOT + "/")) return;
      // path: /opfs/home/notes/<folder-slug>/<note-slug>.md
      const tail = payload.path.slice(NOTES_ROOT.length + 1);
      const parts = tail.split("/");
      if (parts.length !== 2) return; // ignore top-level dir events
      const fileName = parts[1];
      if (!fileName.endsWith(".md")) return;
      const slug = fileName.slice(0, -3);
      const note = notesRef.current.find((n) => n.slug === slug);
      if (!note) return;
      if (payload.type === "disappeared") {
        // External rm: leave the note in the index, blank the body.
        // The user can still see the metadata and re-create the body
        // (or restore the file) without losing the note record.
        setBodyCache((curr) => {
          if (!curr.has(note.id)) return curr;
          const next = new Map(curr);
          next.set(note.id, "");
          return next;
        });
        flash("Note file deleted outside Notes", "error");
        return;
      }
      const body = await loadBody(note, foldersRef.current);
      setBodyCache((curr) => {
        const next = new Map(curr);
        next.set(note.id, body);
        return next;
      });
    };
    const offKv = GearShell.events.on("config.changed", reloadKv);
    const offFs = GearShell.events.on("fs.changed", reloadFs);
    // Acquire the watcher AFTER the initial loadAll so we don't race
    // with the seed/migration writing files for the first time.
    if (typeof GearShell?.fs?.watch === "function") {
      GearShell.fs.watch(NOTES_ROOT, { recursive: true })
        .then((handle) => { watchHandle = handle; })
        .catch(() => { /* watcher unsupported — fall back to kv-only sync */ });
    }
    return () => {
      cancelled = true;
      offKv();
      offFs();
      if (watchHandle && typeof GearShell?.fs?.unwatch === "function") {
        GearShell.fs.unwatch(watchHandle).catch(() => {});
      }
    };
  // We intentionally bind the effect once; bodiesRef / notesRef
  // mirror the latest arrays so the event handlers stay current
  // without re-subscribing on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Folder selection: from the sidebar we land on the list view; if
  // the user is already on the editor we keep them there (Apple
  // Notes doesn't push a new list when a folder changes mid-edit).
  const setActiveFolderIdWithNav = useCallback((id) => {
    setActiveFolderId(id);
    setView((curr) => (curr === "editor" ? curr : "list"));
  }, []);

  const setActiveNoteIdWithNav = useCallback((id) => {
    setActiveNoteId(id);
    if (id) setView((curr) => {
      setPrevView(curr);
      return "editor";
    });
  }, []);

  // --- CRUD: notes ---
  const createNote = useCallback(async (folderId) => {
    const resolvedFolderId =
      folderId ||
      (activeFolderId !== "all" && activeFolderId !== "pinned"
        ? activeFolderId
        : folders[0]?.id);
    if (!resolvedFolderId) {
      flash("Create a folder first.", "error");
      return;
    }
    // `storageCreateNote` reads nextId from kv directly and increments
    // it; we just need the freshest note it produced.
    const result = await storageCreateNote(resolvedFolderId, {}, {
      folders,
      notes,
    });
    if (!result) {
      flash("Could not create note", "error");
      return;
    }
    const { note } = result;
    await kvSetNext(result.nextId);
    const nextNotes = [note, ...notes];
    // Persist the index so other Notes panels pick the new note up via
    // config.changed. The fs body was already written by storageCreateNote.
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.notes, nextNotes);
    }
    setNotes(nextNotes);
    setBodyCache((curr) => {
      const next = new Map(curr);
      next.set(note.id, "");
      return next;
    });
    setActiveFolderIdWithNav(resolvedFolderId);
    setActiveNoteIdWithNav(note.id);
  }, [activeFolderId, folders, notes, setActiveFolderIdWithNav, setActiveNoteIdWithNav]);

  const updateNote = useCallback(async (id, patch) => {
    const idx = notes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const current = notes[idx];
    let nextRecord;
    try {
      nextRecord = await persistUpdate(current, folders, patch, {
        bodies: bodiesRef.current,
      });
    } catch (error) {
      flash(error?.message || String(error), "error");
      return;
    }
    const nextNotes = [...notes];
    nextNotes[idx] = nextRecord;
    // Body writes are debounced (the Editor's 400ms timer) and write
    // only to fs. Title/pin/folder changes also touch the kv index
    // so other panels see them — but body-only edits skip the kv
    // round-trip to keep the audit ring readable.
    const isBodyOnly = Object.keys(patch).every((key) => key === "body");
    if (!isBodyOnly && typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.notes, nextNotes);
    }
    setNotes(nextNotes);
    if (patch.body !== undefined) {
      setBodyCache((curr) => {
        const next = new Map(curr);
        next.set(id, patch.body);
        return next;
      });
    }
  }, [notes, folders]);

  const deleteNote = useCallback(async (id) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    await persistDelete(note, folders);
    const nextNotes = notes.filter((n) => n.id !== id);
    const nextPinned = pinned.filter((p) => p !== id);
    setNotes(nextNotes);
    setPinned(nextPinned);
    setBodyCache((curr) => {
      if (!curr.has(id)) return curr;
      const next = new Map(curr);
      next.delete(id);
      return next;
    });
    // Persist the index drop + pin drop so other panels see it.
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.notes, nextNotes);
      await GearShell.config.kv.set(KV.pinned, nextPinned);
    }
    if (activeNoteId === id) {
      setActiveNoteId(null);
      // After deleting the open note, return to the list the user
      // came from. Don't drop them on the sidebar — that's a
      // confusing jump. Apple Notes returns to the previous screen
      // in this case.
      setView((curr) => (curr === "editor" ? "list" : curr));
    }
  }, [notes, pinned, folders, activeNoteId]);

  const togglePin = useCallback(async (id) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const nextPinned = note.pinned
      ? pinned.filter((p) => p !== id)
      : [...pinned, id];
    const nextNote = { ...note, pinned: !note.pinned };
    const nextNotes = notes.map((n) => (n.id === id ? nextNote : n));
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.pinned, nextPinned);
      await GearShell.config.kv.set(KV.notes, nextNotes);
    }
    setPinned(nextPinned);
    setNotes(nextNotes);
  }, [notes, pinned]);

  // --- CRUD: folders ---
  const createFolder = useCallback(async (name) => {
    const result = await persistCreateFolder(name, {
      folders,
      notes,
    });
    if (!result) {
      flash("Could not create folder", "error");
      return;
    }
    const { folder } = result;
    await kvSetNext(result.nextId);
    const nextFolders = [...folders, folder];
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.folders, nextFolders);
    }
    setFolders(nextFolders);
    setActiveFolderIdWithNav(folder.id);
  }, [folders, notes, setActiveFolderIdWithNav]);

  const renameFolder = useCallback(async (id, name) => {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const nextRecord = await persistRenameFolder(folder, name);
    const nextFolders = folders.map((f) => (f.id === id ? nextRecord : f));
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.folders, nextFolders);
    }
    setFolders(nextFolders);
  }, [folders]);

  const deleteFolder = useCallback(async (id) => {
    // Deleting a folder moves its notes into the first remaining
    // folder (Apple Notes' default behaviour). Reject the delete when
    // it would leave zero folders — there must always be one home.
    const remaining = folders.filter((f) => f.id !== id);
    if (!remaining.length) {
      flash("Cannot delete the last folder.", "error");
      return;
    }
    const home = remaining[0].id;
    const deleted = folders.find((f) => f.id === id);
    const nextNotes = notes.map((n) =>
      n.folderId === id ? { ...n, folderId: home } : n,
    );
    await persistDeleteFolder(deleted, remaining);
    if (typeof GearShell?.config?.kv?.set === "function") {
      await GearShell.config.kv.set(KV.folders, remaining);
      await GearShell.config.kv.set(KV.notes, nextNotes);
    }
    setFolders(remaining);
    setNotes(nextNotes);
    if (activeFolderId === id) setActiveFolderIdWithNav(home);
  }, [folders, notes, activeFolderId, setActiveFolderIdWithNav]);

  // --- Derived selectors ---
  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list;
    if (activeFolderId === "all") list = notes;
    else if (activeFolderId === "pinned") list = notes.filter((n) => pinned.includes(n.id));
    else list = notes.filter((n) => n.folderId === activeFolderId);
    if (q) {
      list = list.filter((n) => {
        const body = bodyCache.get(n.id) || "";
        return (n.title + " " + body).toLowerCase().includes(q);
      });
    }
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [notes, pinned, activeFolderId, query, bodyCache]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId],
  );

  // `activeNote` augmented with the body bytes from the cache. The
  // editor binds `note.title` / `note.body` directly; components
  // downstream should treat `activeNote.body` as the source of truth.
  const activeNoteWithBody = useMemo(() => {
    if (!activeNote) return null;
    return { ...activeNote, body: bodyCache.get(activeNote.id) || "" };
  }, [activeNote, bodyCache]);

  const folderCounts = useMemo(() => {
    const counts = { all: notes.length, pinned: pinned.length };
    for (const f of folders) counts[f.id] = notes.filter((n) => n.folderId === f.id).length;
    return counts;
  }, [notes, pinned, folders]);

  return {
    folders,
    notes,
    pinned,
    activeFolderId,
    setActiveFolderId: setActiveFolderIdWithNav,
    activeNoteId,
    setActiveNoteId: setActiveNoteIdWithNav,
    activeNote: activeNoteWithBody,
    visibleNotes,
    folderCounts,
    query,
    setQuery,
    notice,
    loading,
    renamingFolder,
    setRenamingFolder,
    view,
    prevView,
    goToView,
    goBack,
    flash,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    createFolder,
    renameFolder,
    deleteFolder,
    bodyCache,
    notePath: (note) => notePath(note, folders.find((f) => f.id === note.folderId)),
  };
}

// kvSetNext is a tiny helper so the storage layer doesn't need to know
// about kv directly — the store owns the kv side of the world.
async function kvSetNext(value) {
  if (typeof GearShell?.config?.kv?.set === "function") {
    await GearShell.config.kv.set(KV.nextId, value);
  }
}