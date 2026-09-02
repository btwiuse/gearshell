// notes-store.js — useNotesStore hook: the central state container
// for the Notes plugin. Keeps CRUD actions + derived selectors in
// one place so Sidebar / NoteList / Editor stay pure presentation
// components.

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  bridgeAvailable, KV, kvGet, kvSet, kvDelete,
  ensureSeed, loadAll, genId,
} from "./notes.js";

export function useNotesStore() {
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [pinned, setPinned] = useState([]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSeed();
      const state = await loadAll();
      if (cancelled) return;
      setFolders(state.folders);
      setNotes(state.notes);
      setPinned(state.pinned);
      setLoading(false);
    })();
    if (!bridgeAvailable) return;
    // Live-sync: every config.changed event re-snapshots the kv store.
    // Multiple Notes panels open at once all redraw against the same
    // canonical store — there's no peer-to-peer sync layer needed
    // because the kv store IS the source of truth.
    const reload = () => {
      loadAll().then((state) => {
        if (cancelled) return;
        setFolders(state.folders);
        setNotes(state.notes);
        setPinned(state.pinned);
      });
    };
    GearShell.events.on("config.changed", reload);
    return () => {
      cancelled = true;
      GearShell.events.off("config.changed", reload);
    };
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
    const state = await loadAll();
    const nextId = state.nextId || 1;
    const now = Date.now();
    const resolvedFolderId =
      folderId ||
      (activeFolderId !== "all" && activeFolderId !== "pinned"
        ? activeFolderId
        : state.folders[0]?.id);
    if (!resolvedFolderId) {
      flash("Create a folder first.", "error");
      return;
    }
    const note = {
      id: genId("nte", nextId),
      folderId: resolvedFolderId,
      title: "",
      body: "",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    await kvSet(KV.nextId, nextId + 1);
    await kvSet(KV.notes, [note, ...state.notes]);
    // Update local state immediately so the editor re-renders
    // against the new note without waiting for the
    // config.changed event — the bridge doesn't echo events back
    // to the source iframe, so without this the editor would
    // briefly show "Select a note" before the round-trip
    // completes. The config.changed handler will still re-snapshot
    // when other panels write, but for our own writes we trust
    // the local update.
    setNotes((curr) => [note, ...curr]);
    // setActiveFolderIdWithNav pushes the list view if we're on the
    // sidebar; setActiveNoteIdWithNav pushes the editor with the
    // new note. Both setters already handle the prevView bookkeeping.
    setActiveFolderIdWithNav(resolvedFolderId);
    setActiveNoteIdWithNav(note.id);
  }, [activeFolderId, flash, setActiveFolderIdWithNav, setActiveNoteIdWithNav]);

  const updateNote = useCallback(async (id, patch) => {
    const state = await loadAll();
    const next = state.notes.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
    );
    await kvSet(KV.notes, next);
    setNotes(next);
  }, []);

  const deleteNote = useCallback(async (id) => {
    const state = await loadAll();
    const next = state.notes.filter((n) => n.id !== id);
    await kvSet(KV.notes, next);
    const nextPinned = (state.pinned || []).filter((p) => p !== id);
    await kvSet(KV.pinned, nextPinned);
    setNotes(next);
    setPinned(nextPinned);
    if (activeNoteId === id) {
      setActiveNoteId(null);
      // After deleting the open note, return to the list the user
      // came from. Don't drop them on the sidebar — that's a
      // confusing jump. Apple Notes returns to the previous screen
      // in this case.
      setView((curr) => (curr === "editor" ? "list" : curr));
    }
  }, [activeNoteId]);

  const togglePin = useCallback(async (id) => {
    const state = await loadAll();
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const nextPinned = note.pinned
      ? (state.pinned || []).filter((p) => p !== id)
      : [...(state.pinned || []), id];
    const nextNotes = state.notes.map((n) =>
      n.id === id ? { ...n, pinned: !note.pinned } : n,
    );
    await kvSet(KV.pinned, nextPinned);
    await kvSet(KV.notes, nextNotes);
    setPinned(nextPinned);
    setNotes(nextNotes);
  }, []);

  // --- CRUD: folders ---
  const createFolder = useCallback(async (name) => {
    const state = await loadAll();
    const folder = {
      id: genId("fld", state.nextId || 1),
      name: name || "New Folder",
      createdAt: Date.now(),
    };
    const nextFolders = [...state.folders, folder];
    await kvSet(KV.nextId, (state.nextId || 1) + 1);
    await kvSet(KV.folders, nextFolders);
    setFolders(nextFolders);
    setActiveFolderIdWithNav(folder.id);
  }, [setActiveFolderIdWithNav]);

  const renameFolder = useCallback(async (id, name) => {
    const state = await loadAll();
    const nextFolders = state.folders.map((f) =>
      f.id === id ? { ...f, name } : f,
    );
    await kvSet(KV.folders, nextFolders);
    setFolders(nextFolders);
  }, []);

  const deleteFolder = useCallback(async (id) => {
    const state = await loadAll();
    // Deleting a folder moves its notes into the first remaining
    // folder (Apple Notes' default behaviour). Reject the delete when
    // it would leave zero folders — there must always be one home.
    const remaining = state.folders.filter((f) => f.id !== id);
    if (!remaining.length) {
      flash("Cannot delete the last folder.", "error");
      return;
    }
    const home = remaining[0].id;
    const nextNotes = state.notes.map((n) =>
      n.folderId === id ? { ...n, folderId: home } : n,
    );
    await kvSet(KV.folders, remaining);
    await kvSet(KV.notes, nextNotes);
    setFolders(remaining);
    setNotes(nextNotes);
    if (activeFolderId === id) setActiveFolderIdWithNav(home);
  }, [activeFolderId, flash, setActiveFolderIdWithNav]);

  // --- Derived selectors ---
  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list;
    if (activeFolderId === "all") list = notes;
    else if (activeFolderId === "pinned") list = notes.filter((n) => pinned.includes(n.id));
    else list = notes.filter((n) => n.folderId === activeFolderId);
    if (q) {
      list = list.filter((n) =>
        (n.title + " " + n.body).toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [notes, pinned, activeFolderId, query]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId],
  );

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
    activeNote,
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
  };
}