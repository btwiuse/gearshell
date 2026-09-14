// workspace-fs-watch.js — fs.watch / fs.unwatch / fs.listWatchers
// backed by the browser's FileSystemObserver on /opfs/... paths (split
// out of workspace-fs-api.js for the 500-line rule).
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

import { emitFsChanged } from "./workspace-events.js";

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

function requirePath(path) {
  if (typeof path !== "string" || !path) {
    throw new Error("path must be a non-empty string");
  }
  return path;
}

export async function watch(path, options = {}) {
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

export async function unwatch(handle) {
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
export async function listWatchers() {
  return {
    ok: true,
    watchers: [...activeWatchers.entries()].map(([id, entry]) => ({
      id,
      root: entry.root,
    })),
  };
}
