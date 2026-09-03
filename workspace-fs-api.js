// workspace-fs-api.js — host-side implementation of the GearShell.fs
// namespace exposed to iframe plugins and the in-page API.
//
// Each method is a thin wrapper around the wanix root's VFS calls
// (readFile / writeFile / readDir / stat / makeDir / remove). The
// wanix kernel is the same one the Files panel uses, so an iframe
// plugin that does `GearShell.fs.readText("/opfs/home/foo.txt")`
// reads the same bytes the Files panel would show when it navigates
// there. Paths follow the wanix namespace syntax (see
// plugin/crush-playground/kv-api.js for a contrasting per-workspace
// store) — strings like ".", "task", "#task/repl-1/term/data",
// "/opfs/home", or any bind-mounted subtree.
//
// The readFile / writeFile payloads are JSON-serialisable Uint8Array
// (serialised through JSON.stringify base64-style byte round-trips).
// Text helpers readFileText / writeFileText accept and return plain
// strings, doing the TextEncoder / TextDecoder work in place so the
// plugin doesn't have to import the codecs.
//
// Iframe plugins opt in via the `fs.*` permission path; permissions
// are enforced by the existing permitsPath whitelist in
// plugins-iframe-api.js. Path sandboxing is left to the wanix
// namespace layout — the kernel's bind graph determines what a
// given mount is allowed to read or write.
//
// watch() / unwatch() use the browser's FileSystemObserver API on
// the OPFS handles behind any /opfs/... bind. The wanix kernel has
// no fs.notify primitive, so watching requires a host-side
// FileSystemDirectoryHandle — only /opfs/... paths qualify today.
// Each FileSystemObserver event is translated to a wanix path and
// forwarded through `events.emit("fs.changed", payload)`, which the
// existing iframe bridge (`plugins-iframe-api.js handleSubscribe`)
// already relays to subscribed plugins. Subscribers see one event
// per chrome batch (Chrome delivers an array, we expand it).

import { getWanixRoot, wanixSystem } from "./app-state.js";
import {
  bindLocalDir,
  loadStoredMounts,
  removeStoredMount,
  sanitizeMountName,
  storeMount,
} from "./plugin/files-mounts.js";
import { emit as emitEvent } from "./workspace-events.js";

function getRoot() {
  try {
    return getWanixRoot();
  } catch (error) {
    return { __error: error?.message || String(error) };
  }
}

function requireRoot() {
  const root = getRoot();
  if (root && root.__error) throw new Error(root.__error);
  if (!root) throw new Error("wanix system is not ready");
  return root;
}

function requirePath(path) {
  if (typeof path !== "string" || !path) {
    throw new Error("path must be a non-empty string");
  }
  return path;
}

function toUint8Array(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("writeFile payload must be Uint8Array or array of bytes");
}

// Read the full contents of `path` as a Uint8Array. Resolves with the
// bytes the wanix kernel returned; rejects with the kernel's error
// message on ENOENT, EACCES, etc. The iframe bridge carries the
// Uint8Array across postMessage unchanged (structured-clone), so the
// plugin side receives a real Uint8Array without any JSON wrapping.
async function readFile(path) {
  requirePath(path);
  const root = requireRoot();
  return await root.readFile(path);
}

async function readFileText(path) {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes || new Uint8Array(0));
}

// Write `contents` (Uint8Array, plain Array<number>, or ArrayBuffer)
// to `path`, truncating any existing file. wanix's writeFile helper
// performs the chmod that the signalfs rejects, so the kernel uses
// the openWritable / writer.close pair on the term device but the
// VFS writeFile path is safe for ordinary files.
async function writeFile(path, contents) {
  requirePath(path);
  const root = requireRoot();
  const bytes = toUint8Array(contents);
  await root.writeFile(path, bytes);
  return { ok: true, path, bytes: bytes.byteLength };
}

async function writeFileText(path, text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  return writeFile(path, bytes);
}

// List the immediate children of `path`. wanix readDir returns bare
// names with directories marked by a trailing slash; we normalise to
// { name, isDirectory } so the iframe side gets a stable shape
// without having to know about the slash convention.
async function readDir(path) {
  requirePath(path);
  const root = requireRoot();
  const rawNames = await root.readDir(path);
  const names = Array.isArray(rawNames) ? rawNames : [];
  return names.map((name) => {
    const isDirectory = name.endsWith("/");
    return { name: isDirectory ? name.slice(0, -1) : name, isDirectory };
  });
}

async function stat(path) {
  requirePath(path);
  const root = requireRoot();
  const info = await root.stat(path);
  // wanix returns Go-style field names (Size, Mode, IsDir, ModTime
  // in unix seconds). Normalise to snake_case for the plugin side
  // and surface a friendlier top-level isDirectory flag.
  if (!info || typeof info !== "object") return null;
  return {
    path,
    size: typeof info.Size === "number" ? info.Size : null,
    mode: typeof info.Mode === "number" ? info.Mode : null,
    isDirectory: Boolean(info.IsDir),
    isFile: info.IsDir === false,
    modTime: typeof info.ModTime === "number" ? info.ModTime : null,
    raw: info,
  };
}

async function mkdir(path) {
  requirePath(path);
  const root = requireRoot();
  await root.makeDir(path);
  return { ok: true, path };
}

async function rm(path) {
  requirePath(path);
  const root = requireRoot();
  await root.remove(path);
  return { ok: true, path };
}

async function rename(path, nextPath) {
  requirePath(path);
  requirePath(nextPath);
  const root = requireRoot();
  await root.rename(path, nextPath);
  return { ok: true, path, nextPath };
}

function mountMetadata(mount) {
  return {
    id: mount.id,
    name: mount.name,
    dst: mount.dst,
    mode: mount.mode || "readwrite",
    mounted: mount.mounted === true,
    permission: mount.handle?.queryPermission ? "stored" : "unavailable",
  };
}

async function mounts() {
  const stored = await loadStoredMounts();
  return { ok: true, mounts: stored.map(mountMetadata) };
}

async function unmount(id) {
  if (!id) throw new Error("mount id is required");
  const stored = await loadStoredMounts();
  const mount = stored.find((item) => item.id === id);
  if (!mount) return { ok: true, id, removed: false };
  const root = requireRoot();
  if (mount.mounted) await root.unbind(mount.dst, mount.dst);
  await removeStoredMount(id);
  emitFsChanged({ type: "unmounted", id, path: mount.dst });
  return { ok: true, id, removed: true };
}

async function remount(id) {
  if (!id) throw new Error("mount id is required");
  const stored = await loadStoredMounts();
  const mount = stored.find((item) => item.id === id);
  if (!mount) throw new Error(`mount not found: ${id}`);
  if (!mount.handle) throw new Error(`mount handle unavailable: ${id}`);
  const permission = await mount.handle.queryPermission?.({
    mode: mount.mode || "readwrite",
  });
  if (permission !== "granted") throw new Error("mount permission is not granted");
  await bindLocalDir(mount.handle, mount.dst, () => wanixSystem?._kernel);
  const updated = { ...mount, mounted: true };
  await storeMount(updated);
  emitFsChanged({ type: "mounted", id, path: mount.dst });
  return { ok: true, mount: mountMetadata(updated) };
}

// reconnect runs the File System Access picker for a single stored
// mount whose permission was revoked (silent queryPermission no
// longer grants). The picker comes back with a fresh handle bound to
// the same browser-side `id`, so we replace the stored handle and
// re-bind to the same `dst`. If the user picks a different directory
// the bind still works — only the path on disk changes. Returns the
// refreshed mount record.
async function reconnect(id) {
  if (!id) throw new Error("mount id is required");
  const stored = await loadStoredMounts();
  const mount = stored.find((item) => item.id === id);
  if (!mount) throw new Error(`mount not found: ${id}`);
  if (typeof window === "undefined" ||
    typeof window.showDirectoryPicker !== "function") {
    throw new Error(
      "File System Access API is not available in this runtime",
    );
  }
  const handle = await window.showDirectoryPicker({
    mode: mount.mode || "readwrite",
    id: mount.id,
  });
  const name = sanitizeMountName(handle.name);
  await bindLocalDir(handle, mount.dst, () => wanixSystem?._kernel);
  const updated = { ...mount, name, handle, mounted: true };
  await storeMount(updated);
  emitFsChanged({ type: "mounted", id, path: mount.dst, name });
  return { ok: true, mount: mountMetadata(updated) };
}

// requestLocalDir runs the File System Access picker and binds the
// picked directory into the wanix namespace. The picker must run
// inside a real user gesture on the host page (the File System Access
// spec rejects picker calls without one), so this API is host-only
// by construction — iframe plugins reach it by triggering a host
// gesture (button click) and the host forwards the picker. Resolves
// with the persisted mount record (id / name / dst / mode) so the
// panel can navigate to the new bind without a follow-up read.
async function requestLocalDir(name) {
  if (typeof window === "undefined" ||
    typeof window.showDirectoryPicker !== "function") {
    throw new Error(
      "File System Access API is not available in this runtime",
    );
  }
  const id = `gear-mount-${Date.now().toString(36)}-${
    Math.random().toString(36).slice(2, 7)
  }`;
  const handle = await window.showDirectoryPicker({
    mode: "readwrite",
    id,
  });
  const resolved = sanitizeMountName(name || handle.name);
  // Pick a dst that doesn't collide with existing mounts.
  const stored = await loadStoredMounts();
  const used = new Set(stored.map((m) => m.dst));
  let dst = `mnt/${resolved}`;
  for (let i = 2; used.has(dst); i++) dst = `mnt/${resolved}-${i}`;
  await bindLocalDir(handle, dst, () => wanixSystem?._kernel);
  const mount = { id, name: resolved, dst, mode: "readwrite", handle, mounted: true };
  await storeMount(mount);
  emitFsChanged({ type: "mounted", id, path: dst, name });
  return { ok: true, mount: mountMetadata(mount) };
}

// reconnectMountsOnBoot iterates every persisted mount, calls
// queryPermission, and binds back the ones the browser still trusts.
// Returns the current mount list (mounted flags refreshed). The
// Files panel's boot-time restoreMounts flow now goes through this
// single host-side entry point instead of doing its own kernel calls.
async function restoreMounts() {
  const stored = await loadStoredMounts();
  const kernel = wanixSystem?._kernel;
  const next = [];
  for (const mount of stored) {
    const granted = mount.handle?.queryPermission
      ? (await mount.handle.queryPermission({
        mode: mount.mode || "readwrite",
      })) === "granted"
      : Boolean(mount.handle);
    if (granted && kernel?.isReady) {
      try {
        await bindLocalDir(mount.handle, mount.dst, () => wanixSystem?._kernel);
        const updated = { ...mount, mounted: true };
        await storeMount(updated);
        next.push(updated);
        continue;
      } catch (err) {
        console.error("restore mount", mount.dst, err);
      }
    }
    next.push({ ...mount, mounted: false });
  }
  return { ok: true, mounts: next.map(mountMetadata) };
}

// exists() is a stat wrapper that resolves { ok, exists } rather
// than throwing — most callers want the boolean, not a try/catch.
// Returns { ok: false } if the wanix root isn't ready yet so the
// plugin can distinguish a real ENOENT from "kernel not booted".
async function exists(path) {
  try {
    requirePath(path);
    const root = requireRoot();
    await root.stat(path);
    return { ok: true, path, exists: true };
  } catch (error) {
    const message = error?.message || String(error);
    // wanix surfaces ENOENT-style failures with messages like
    // "file does not exist", "no such file or directory", or
    // ENOENT. Match the common shapes so a real ENOENT becomes
    // { exists: false } rather than throwing. Real I/O errors
    // (permission denied, kernel panic, invalid argument) still
    // bubble up — callers who care about the difference can call
    // stat() directly and read the thrown message.
    if (/does not exist|no such|enoent|not found/i.test(message)) {
      return { ok: true, path, exists: false };
    }
    throw error;
  }
}

// --- watch() / unwatch() -------------------------------------------------
//
// Watching is backed by the browser's FileSystemObserver (Chrome's
// native OPFS observer) on the host-side FileSystemDirectoryHandle
// behind each /opfs/... bind. The wanix kernel exposes no notify
// primitive, so the host is the only place that can observe changes
// to the underlying OPFS. For other bind sources (fetch, task, #task/...)
// watching is unsupported in this version; the watcher rejects those
// paths explicitly so the plugin can fall back to polling.
//
// FileSystemObserver returns an array per callback (Chrome batches
// events that fire inside one microtask). We expand the batch and
// emit one fs.changed event per entry — listeners see individual
// mutations and don't need to know about the batching primitive.

const OPFS_PREFIX = "/opfs/";

function isOpfsPath(path) {
  return path === "/opfs" || path.startsWith(OPFS_PREFIX);
}

// Strip the leading "/opfs" so we can walk the OPFS root handle. The
// OPFS root handle IS the "/opfs" mount, so an empty suffix means
// watching the root itself.
function opfsRelativeParts(path) {
  if (path === "/opfs" || path === "/opfs/") return [];
  if (!path.startsWith(OPFS_PREFIX)) {
    throw new Error("path is not under /opfs");
  }
  const tail = path.slice(OPFS_PREFIX.length);
  if (!tail) return [];
  return tail.split("/").filter(Boolean);
}

async function opfsHandleForPath(path) {
  // The OPFS handle tree mirrors the wanix bind: "/" → /opfs (root),
  // "/opfs/home" → root/home, etc. We walk the same way the kernel
  // walks (single-segment getDirectoryHandle per the lessons in
  // memory/verification-pitfalls.md). Missing intermediate segments
  // are NOT auto-created — a watch target must already exist.
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    throw new Error("FileSystemDirectoryHandle is not available in this runtime");
  }
  const parts = opfsRelativeParts(path);
  let handle = await navigator.storage.getDirectory();
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part);
  }
  return handle;
}

// Monotonic watcher id so callers can dispose by handle without
// holding a reference to the underlying FileSystemObserver (which
// isn't postMessage-serialisable).
let nextWatcherId = 1;
const activeWatchers = new Map(); // id -> { observer, root, dispose }

function emitFsChanged(payload) {
  try {
    emitEvent("fs.changed", payload);
  } catch {
    // event bus is best-effort; never break the watcher on a logger
    // failure.
  }
}

function translateEvent(root, rawEvent) {
  // Chrome hands us relativePathComponents (a string[]) describing
  // where the change happened relative to the watched handle. For a
  // single-segment watch the path is `${root}/${parts.join("/")}`;
  // for root-level ops (chrome doesn't deliver these explicitly —
  // the watch handle is always a directory) the parts are non-empty
  // unless a top-level child appeared/disappeared with no name.
  const parts = Array.isArray(rawEvent.relativePathComponents)
    ? rawEvent.relativePathComponents.filter((part) => part !== "")
    : [];
  const suffix = parts.join("/");
  const path = suffix ? `${root}/${suffix}` : root;
  return { path, type: rawEvent.type, root };
}

async function watch(path, options = {}) {
  requirePath(path);
  if (!isOpfsPath(path)) {
    throw new Error(
      `fs.watch only supports /opfs/... paths today (got "${path}")`,
    );
  }
  if (typeof globalThis.FileSystemObserver !== "function") {
    throw new Error(
      "FileSystemObserver is not available in this browser — fs.watch requires a Chromium-based runtime with OPFS observer support",
    );
  }
  const handle = await opfsHandleForPath(path);
  const recursive = options && options.recursive === true;
  const root = path;
  const observer = new globalThis.FileSystemObserver((records) => {
    if (!Array.isArray(records)) return;
    for (const record of records) {
      if (!record || typeof record.type !== "string") continue;
      emitFsChanged(translateEvent(root, record));
    }
  });
  // observe(handle, options?) — recursive must be passed as {recursive:true}
  // to cover the whole subtree, otherwise only the watched directory's
  // immediate children are reported.
  await observer.observe(handle, recursive ? { recursive: true } : undefined);

  const id = nextWatcherId++;
  activeWatchers.set(id, {
    observer,
    root,
    dispose: () => {
      try {
        observer.disconnect();
      } catch {
        // observer already torn down
      }
      activeWatchers.delete(id);
    },
  });
  return { ok: true, id, path, recursive };
}

async function unwatch(handle) {
  if (!handle || typeof handle !== "object") {
    throw new Error("unwatch requires the handle returned by fs.watch");
  }
  const id = handle.id;
  const entry = activeWatchers.get(id);
  if (!entry) {
    return { ok: true, id, removed: false };
  }
  entry.dispose();
  return { ok: true, id, removed: true };
}

// listWatchers() — diagnostic helper used by the playground catalog
// and by hand debugging; not part of the documented plugin API.
async function listWatchers() {
  return {
    ok: true,
    watchers: [...activeWatchers.entries()].map(([id, entry]) => ({
      id,
      root: entry.root,
    })),
  };
}

export const fsApi = {
  readFile,
  readFileText,
  writeFile,
  writeFileText,
  readDir,
  stat,
  exists,
  mkdir,
  rm,
  rename,
  mounts,
  requestLocalDir,
  reconnect,
  remount,
  restoreMounts,
  unmount,
  watch,
  unwatch,
  listWatchers,
};