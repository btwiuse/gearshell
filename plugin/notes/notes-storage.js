// notes-storage.js — the persistence layer for the Notes plugin.
//
// Two backing stores:
//
//   kv  (GearShell.config.kv.*) — folder list, note index, pin list,
//          nextId counter. Small JSON values that change frequently and
//          benefit from kv's atomic + audited writes.
//
//   fs  (GearShell.fs.*)       — note bodies as individual markdown
//          files under /opfs/home/notes/<folder-slug>/<slug>.md. The
//          bodies are the artefact users want shell access to ("cat
//          ~/notes/Personal/todo.md") and the fs mirror lets every other
//          tool — Files panel, terminal, agents — see and edit them
//          directly without going through the kv API.
//
// Layout summary:
//
//   kv  notes:_nextId   — counter for new note / folder ids
//   kv  notes:_folders  — [{id, slug, name, createdAt}]   (new: includes slug)
//   kv  notes:_notes    — [{id, folderId, slug, title, pinned, createdAt,
//                          updatedAt, bodyRef}]            (new: bodyRef points
//                                                         at the fs path;
//                                                         body never lives
//                                                         here anymore)
//   kv  notes:_pinned   — [noteId] (kept for fast filter)
//   kv  notes:_legacy   — write-once migration tag: present while an old
//                          notes:_notes body-bearing record still needs
//                          materialising into fs on first boot.
//
//   fs  /opfs/home/notes/<folder-slug>/<note-slug>.md — note body in
//          markdown (title + first blank line + body). The slugs are
//          stable for the life of the note — renaming a note's title
//          does NOT rename the file (Apple Notes keeps the underlying
//          uuid forever).
//
// The legacy 4-key layout (notes:_notes with embedded body field) is
// read once on boot: every entry's body is written to its fs path and
// the legacy key is then dropped. The flag key `notes:_legacy` is set
// the moment we detect any old-shape record so we only run the migration
// once.
//
// Live-sync:
//   config.changed (kv)   — re-snapshot the index. Body bytes stay in
//                           the local bodyCache until fs.changed arrives.
//   fs.changed            — patch bodyCache for the affected note. The
//                           editor only reflows when activeNote's body
//                           really differs (cheap Object.is check).

const NOTES_ROOT = "/opfs/home/notes";
const KV = {
  nextId: "notes:_nextId",
  folders: "notes:_folders",
  notes: "notes:_notes",
  pinned: "notes:_pinned",
  legacy: "notes:_legacy",
};

// --- bridge guard ---------------------------------------------------------
// notes.js owns `bridgeAvailable`. We re-use it instead of duplicating
// the window.top === window.self check here. When the page is opened
// directly (dev mode), every fs/kv call resolves to undefined and the
// store falls back to in-memory state.
import { bridgeAvailable } from "./notes.js";

async function kvGet(key) {
  if (!bridgeAvailable) return undefined;
  try {
    return await GearShell.config.kv.get(key);
  } catch {
    return undefined;
  }
}

async function kvSet(key, value) {
  if (!bridgeAvailable) return { ok: false };
  try {
    return await GearShell.config.kv.set(key, value);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function kvDelete(key) {
  if (!bridgeAvailable) return { deleted: false };
  try {
    return await GearShell.config.kv.delete(key);
  } catch {
    return { deleted: false };
  }
}

async function fsReadText(path) {
  if (!bridgeAvailable) return "";
  try {
    const text = await GearShell.fs.readFileText(path);
    return typeof text === "string" ? text : "";
  } catch {
    // ENOENT, EACCES, kernel-not-ready: treat as missing body. The store
    // surfaces the empty body in the editor and falls back to the
    // (stale) kv-body cache if the file disappeared mid-session.
    return "";
  }
}

async function fsWriteText(path, text) {
  if (!bridgeAvailable) return { ok: false };
  try {
    return await GearShell.fs.writeFileText(path, String(text ?? ""));
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function fsMkdir(path) {
  if (!bridgeAvailable) return { ok: false };
  try {
    return await GearShell.fs.mkdir(path);
  } catch (error) {
    // EEXIST is fine — the folder already exists, we can proceed.
    const msg = error?.message || String(error);
    if (/exists|already/i.test(msg)) return { ok: true, path };
    return { ok: false, error: msg };
  }
}

async function fsRm(path) {
  if (!bridgeAvailable) return { ok: false };
  try {
    return await GearShell.fs.rm(path);
  } catch (error) {
    // ENOENT is fine — race with external rm, no work to do.
    const msg = error?.message || String(error);
    if (/does not exist|no such|enoent|not found/i.test(msg)) {
      return { ok: true, path, removed: false };
    }
    return { ok: false, error: msg };
  }
}

// --- slug helpers --------------------------------------------------------
// URL-safe slug of a free-form name. Empty / non-ASCII / collision
// fallback is handled by `uniqueSlug`. The slug is computed once and
// persisted in the index so file paths are stable across renames.
function slugify(input) {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueSlug(base, taken) {
  const root = slugify(base) || "note";
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}-${i}`)) i++;
  return `${root}-${i}`;
}

// Markdown body shape — Apple Notes style. The title is the first line,
// a blank line separates it from the body. We parse on read so a
// user-edited file with no title line still renders.
function serializeBody(title, body) {
  const t = String(title || "").trim();
  const b = String(body || "");
  if (!t) return b;
  return `# ${t}\n\n${b}`;
}

function parseBody(text) {
  const raw = String(text || "");
  // YAML-style frontmatter would be nicer; keep it simple for v1:
  // title line starts with "# ". If the file has no heading the whole
  // thing is the body and the title field is empty.
  const m = raw.match(/^#\s+(.+)\n\n?([\s\S]*)$/);
  if (m) return { title: m[1].trim(), body: m[2] };
  return { title: "", body: raw };
}

// --- path helpers --------------------------------------------------------
function folderDir(folder) {
  if (!folder || !folder.slug) return null;
  return `${NOTES_ROOT}/${folder.slug}`;
}

function notePath(note, folder) {
  const dir = folderDir(folder);
  if (!dir || !note || !note.slug) return null;
  return `${dir}/${note.slug}.md`;
}

function findFolder(folders, id) {
  return folders.find((f) => f.id === id) || null;
}

// --- legacy migration ----------------------------------------------------
// v1: notes:_notes had { id, folderId, title, body, pinned, createdAt,
// updatedAt } and there was no notes:_folders.slug / notes:_notes.slug.
// v2: bodies on fs; index carries slug + bodyRef instead of body.
// Migration runs once, triggered by the presence of either old-shape
// records or the notes:_legacy marker.
function isLegacyNote(record) {
  return record && typeof record.body === "string" && !record.slug;
}
function isLegacyFolder(record) {
  return record && record.name != null && !record.slug;
}

async function migrateLegacy(state) {
  if (!Array.isArray(state.notes) || !Array.isArray(state.folders)) return state;

  const hasLegacyNotes = state.notes.some(isLegacyNote);
  const hasLegacyFolders = state.folders.some(isLegacyFolder);
  if (!hasLegacyNotes && !hasLegacyFolders) {
    // Drop the marker if present so future boots skip this branch.
    await kvDelete(KV.legacy);
    return state;
  }

  // Compute slugs in two passes so child entries can dedup against
  // sibling allocations.
  const folderSlugs = new Set();
  const folders = state.folders.map((f) => {
    const slug = uniqueSlug(f.name, folderSlugs);
    folderSlugs.add(slug);
    const { body: _body, ...rest } = f;
    return { ...rest, slug };
  });

  const noteSlugs = new Set();
  const notes = state.notes.map((n) => {
    const slug = uniqueSlug(n.title || n.id, noteSlugs);
    noteSlugs.add(slug);
    return {
      id: n.id,
      folderId: n.folderId,
      slug,
      title: n.title || "",
      pinned: !!n.pinned,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      bodyRef: `${folderSlugFor(folders, n.folderId)}/${slug}.md`,
    };
  });

  // Materialise bodies to fs. The index write happens AFTER all bodies
  // land so a crash mid-migration leaves the old index intact and
  // the user can retry on next boot.
  for (const note of notes) {
    if (isLegacyNote(state.notes.find((n) => n.id === note.id))) {
      const oldNote = state.notes.find((n) => n.id === note.id);
      const folder = folders.find((f) => f.id === note.folderId);
      if (!folder) continue;
      const dir = folderDir(folder);
      if (!dir) continue;
      await fsMkdir(dir);
      await fsWriteText(notePath(note, folder), serializeBody(oldNote.title, oldNote.body));
    }
  }

  // Persist the new index — both shape and slug keys — and drop the
  // legacy marker only on full success.
  await kvSet(KV.folders, folders);
  await kvSet(KV.notes, notes);
  await kvDelete(KV.legacy);

  return { ...state, folders, notes };
}

function folderSlugFor(folders, folderId) {
  const f = folders.find((entry) => entry.id === folderId);
  return f ? f.slug : "_orphan";
}

// --- load / save ----------------------------------------------------------
// Returns { folders, notes, pinned, nextId, bodies }.
//   folders: [{id, slug, name, createdAt}]
//   notes:   [{id, folderId, slug, title, pinned, createdAt, updatedAt,
//              bodyRef}]
//   pinned:  [noteId]
//   nextId:  number
//   bodies:  Map<noteId, bodyString> — every note's current body, loaded
//            from fs in parallel. Missing files surface as "".
async function loadAll() {
  const [folders, notes, nextId, pinned] = await Promise.all([
    kvGet(KV.folders),
    kvGet(KV.notes),
    kvGet(KV.nextId),
    kvGet(KV.pinned),
  ]);
  let state = {
    folders: Array.isArray(folders) ? folders : [],
    notes: Array.isArray(notes) ? notes : [],
    nextId: typeof nextId === "number" ? nextId : 1,
    pinned: Array.isArray(pinned) ? pinned : [],
  };
  state = await migrateLegacy(state);

  // Lazy ensure every note has a slug + bodyRef so legacy-incomplete
  // records (e.g. partial migrations) still render.
  const folderSlugs = new Set(state.folders.map((f) => f.slug).filter(Boolean));
  let changed = false;
  for (const folder of state.folders) {
    if (!folder.slug) {
      folder.slug = uniqueSlug(folder.name, folderSlugs);
      folderSlugs.add(folder.slug);
      changed = true;
    }
  }
  const noteSlugs = new Set(state.notes.map((n) => n.slug).filter(Boolean));
  for (const note of state.notes) {
    if (!note.slug) {
      note.slug = uniqueSlug(note.title || note.id, noteSlugs);
      noteSlugs.add(note.slug);
      changed = true;
    }
    const folder = state.folders.find((f) => f.id === note.folderId);
    note.bodyRef = `${folder ? folder.slug : "_orphan"}/${note.slug}.md`;
  }
  if (changed) {
    await kvSet(KV.folders, state.folders);
    await kvSet(KV.notes, state.notes);
  }

  // Make sure the notes root exists so the first write doesn't 404.
  await fsMkdir(NOTES_ROOT);

  // Load every body in parallel. Files that 404 fall through to "" —
  // the user just hasn't created them yet OR the migration hasn't run.
  const bodies = new Map();
  await Promise.all(
    state.notes.map(async (note) => {
      const path = `${NOTES_ROOT}/${note.bodyRef}`;
      bodies.set(note.id, await fsReadText(path));
    }),
  );

  return { ...state, bodies };
}

async function loadBody(note, folders) {
  const folder = findFolder(folders, note.folderId);
  if (!folder) return "";
  const path = notePath(note, folder);
  if (!path) return "";
  return fsReadText(path);
}

// Create a new note (in-memory + fs + kv index).
async function createNote(folderId, partial = {}, state) {
  const folders = state.folders;
  const nextId = state.nextId || 1;
  const now = Date.now();
  const folder = findFolder(folders, folderId) || folders[0];
  if (!folder) return null;
  const slug = uniqueSlug(partial.title || `note-${nextId}`, new Set(state.notes.map((n) => n.slug)));
  const note = {
    id: `nte_${nextId.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    folderId: folder.id,
    slug,
    title: partial.title || "",
    pinned: false,
    createdAt: now,
    updatedAt: now,
    bodyRef: `${folder.slug}/${slug}.md`,
  };
  const dir = folderDir(folder);
  await fsMkdir(dir);
  await fsWriteText(`${NOTES_ROOT}/${note.bodyRef}`, serializeBody(note.title, ""));
  await kvSet(KV.nextId, nextId + 1);
  return { note, nextId: nextId + 1 };
}

// Update a note. Title/body move to fs; everything else (pinned, folder,
// updatedAt) stays in kv. If the folder moved we mkdir the new dir and
// (best-effort) rm the old body file.
async function persistUpdate(note, folders, patch, state) {
  const next = { ...note, ...patch, updatedAt: patch.updatedAt || Date.now() };

  // Re-slug if title changed and the user hasn't manually pinned a slug.
  // Slugs only change on explicit user action (Apple-style "stable
  // filename") — we keep them stable forever in v1.
  const folderChanged = patch.folderId && patch.folderId !== note.folderId;
  if (folderChanged) {
    const newFolder = findFolder(folders, next.folderId);
    if (!newFolder) throw new Error(`unknown folder: ${next.folderId}`);
    next.bodyRef = `${newFolder.slug}/${note.slug}.md`;
    await fsMkdir(folderDir(newFolder));
  }

  if (patch.title != null || patch.body != null) {
    await fsWriteText(`${NOTES_ROOT}/${next.bodyRef}`, serializeBody(next.title, patch.body ?? state.bodies.get(note.id) ?? ""));
  }

  if (folderChanged && state.bodies.has(note.id)) {
    const oldFolder = findFolder(folders, note.folderId);
    if (oldFolder) {
      await fsRm(`${NOTES_ROOT}/${oldFolder.slug}/${note.slug}.md`);
    }
  }

  // Strip transient fields before returning so the index shape stays
  // narrow (no body / no bodyRef mutation outside this module).
  const { body: _body, ...indexEntry } = next;
  return indexEntry;
}

async function persistDelete(note, folders) {
  const folder = findFolder(folders, note.folderId);
  if (folder) {
    await fsRm(`${NOTES_ROOT}/${folder.slug}/${note.slug}.md`);
  }
}

// Folder create: pick a slug, mkdir the directory, kv the folder list.
async function persistCreateFolder(name, state) {
  const nextId = state.nextId || 1;
  const slug = uniqueSlug(name || `folder-${nextId}`, new Set(state.folders.map((f) => f.slug)));
  const folder = {
    id: `fld_${nextId.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    slug,
    name: name || "New Folder",
    createdAt: Date.now(),
  };
  await fsMkdir(`${NOTES_ROOT}/${slug}`);
  await kvSet(KV.nextId, nextId + 1);
  return { folder, nextId: nextId + 1 };
}

// Rename a folder. Slug stays stable (the dir path is anchored to the
// slug, not the name). Same as Apple Notes — renaming the visible label
// doesn't move the on-disk file.
async function persistRenameFolder(folder, name) {
  // nothing to do on fs; kv write is the caller's job.
  return { ...folder, name };
}

async function persistDeleteFolder(folder, survivors) {
  // Caller already re-homed the folder's notes in `survivors`; we just
  // remove the directory. ENOENT is fine.
  await fsRm(`${NOTES_ROOT}/${folder.slug}`);
}

export {
  NOTES_ROOT,
  KV,
  loadAll,
  loadBody,
  createNote,
  persistUpdate,
  persistDelete,
  persistCreateFolder,
  persistRenameFolder,
  persistDeleteFolder,
  notePath,
  folderDir,
  parseBody,
  serializeBody,
  slugify,
  uniqueSlug,
};