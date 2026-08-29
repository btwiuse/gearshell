// app-plugin-cache.js — plugin bind content cache (OPFS-backed).
//
// Every plugin-declared wasm binary is downloaded once into
// opfs/cache/plugin/<pluginId>@<pluginVersion>/<dst basename>; a sidecar
// <file>.src records the source URL it was fetched from, so a bumped pin
// (same plugin version, new src) re-downloads automatically.
//
// After priming, task mounts prefer a session-scoped blob URL of the
// cached copy over the origin URL: task boots are offline-capable and
// skip the per-open fetch storm. The blob map is rebuilt on every boot
// (blob URLs are session-scoped); OPFS is the durable layer.
//
// Honest boundary: caching does NOT reduce the per-task memory of a
// mounted file — the bytes still land in the task kernel's fs whenever
// the bind is mounted (fskit nodeFile.data). The memory fix is scoped
// mounting (see plugin/bbtex embedProfileFor); this cache removes the
// repeated download, the network latency, and the origin dependency.

const CACHE_ROOT = ["cache", "plugin"];
const CONCURRENCY = 3;

// src URL -> blob URL for this session. Built by primePluginContentCache.
const blobBySrc = new Map();

let rootPromise = null;

async function cacheRoot() {
  if (!rootPromise) {
    rootPromise = (async () => {
      const root = await navigator.storage.getDirectory();
      let dir = root;
      for (const part of CACHE_ROOT) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
      return dir;
    })();
  }
  return rootPromise;
}

async function versionedDir(plugin) {
  const dir = await cacheRoot();
  return dir.getDirectoryHandle(`${plugin.id}@${plugin.version}`, {
    create: true,
  });
}

// Cache one wasm entry when missing or stale; returns a session blob URL.
async function cacheOne(plugin, wasm) {
  if (!wasm?.src) return null;
  try {
    const dir = await versionedDir(plugin);
    const name = String(wasm.dst).split("/").pop() || "bin";
    let fresh = false;
    try {
      const srcHandle = await dir.getFileHandle(`${name}.src`);
      fresh = (await (await srcHandle.getFile()).text()) === wasm.src;
    } catch {
      fresh = false;
    }
    if (!fresh) {
      const response = await fetch(wasm.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const writable = await dir
        .getFileHandle(name, { create: true })
        .then((handle) => handle.createWritable());
      // Stream straight to OPFS: no full copy held in JS memory.
      await response.body.pipeTo(writable);
      const srcWritable = await dir
        .getFileHandle(`${name}.src`, { create: true })
        .then((handle) => handle.createWritable());
      await srcWritable.write(wasm.src);
      await srcWritable.close();
    }
    const file = await dir.getFileHandle(name);
    return URL.createObjectURL(await file.getFile());
  } catch (error) {
    console.error(`plugin cache: ${plugin.id} ${wasm.dst} failed`, error);
    return null;
  }
}

// Download every enabled plugin's wasm deps into OPFS (bounded
// concurrency) and build the src -> blob URL map for this session.
// Fire-and-forget from boot: a task booting before priming finishes
// falls back to the origin src, which is fine.
export function primePluginContentCache(plugins) {
  const jobs = [];
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    if (!plugin?.enabled) continue;
    for (const wasm of plugin.wasm || []) jobs.push({ plugin, wasm });
  }
  if (jobs.length === 0) return Promise.resolve();
  let index = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, jobs.length) },
    async () => {
      while (index < jobs.length) {
        const { plugin, wasm } = jobs[index++];
        const blobUrl = await cacheOne(plugin, wasm);
        if (blobUrl) blobBySrc.set(wasm.src, blobUrl);
      }
    },
  );
  return Promise.all(workers);
}

// Sync lookup for task-bind creation: the cached copy for a fetch src,
// or null to keep using the origin URL.
export function cachedBlobUrl(src) {
  return blobBySrc.get(src) || null;
}
