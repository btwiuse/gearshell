// inference/opfs-cache.js — Origin Private File System tier for GGUF.
//
// The inference host fetches ~3.8 GB GGUF blobs via HTTP range
// requests. Cache Storage caches individual range responses but the
// browser can evict them under storage pressure — a user returning
// after a few weeks may see a cold fetch again.
//
// OPFS gives us a stable on-disk copy:
//   - First load: stream range requests into a single file under
//     navigator.storage.getDirectory(). The host reports progress
//     from the write loop, not just the network.
//   - Subsequent loads: serve the file directly via File handle.
//     SyncAccessHandle (Worker-only) gives bitgpu's createEngine
//     zero-copy access to WGPUBuffer — much faster than
//     Cache Storage's ReadableStream chunking layer.
//   - navigator.storage.persist() keeps the OPFS file alive
//     even when other storage is pressured.
//
// Tier fallback: when OPFS is unavailable (Safari < 102, iframe
// sandboxed origin, persistent storage denied), this module is a
// no-op and bitgpu-engine falls back to plain Cache Storage.
//
// Implementation notes:
//   - One file per model id, named after the gguf URL's last path
//     segment so different versions of the same model don't collide.
//   - Writes go through a "completion" record in OPFS metadata
//     (separate JSON file). Until the record is present, the file
//     is partial — readers must fall back to network for any byte
//     range the file doesn't contain.
//   - We don't try to be clever about partial reuse across models;
//     if a new GGUF arrives, the old OPFS file is left in place
//     (cheap) and the new one writes alongside it. Cleanup is a
//     manual `clearOpfsCache()` call from the inference settings
//     panel.

const FILE_PREFIX = "gguf-";
const META_PREFIX = "meta-";
const META_VERSION = 1;

function validateIngestArgs(totalSize, fetchRange) {
  if (!Number.isFinite(totalSize) || totalSize <= 0) {
    throw new Error("OPFS ingest requires totalSize");
  }
  if (typeof fetchRange !== "function") {
    throw new Error("OPFS ingest requires fetchRange(offset, length)");
  }
}

async function getRoot() {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    return null;
  }
  try {
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

async function requestPersistent() {
  if (typeof navigator === "undefined") return false;
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function safeName(input) {
  // OPFS file names reject a few characters; hash long urls so we
  // don't blow past filesystem limits on shared hosting.
  const safe = String(input ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (safe.length <= 96) return safe;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return safe.slice(0, 64) + "_" + (hash >>> 0).toString(36);
}

async function readMeta(root, name) {
  try {
    const handle = await root.getFileHandle(META_PREFIX + name);
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeMeta(root, name, meta) {
  try {
    const handle = await root.getFileHandle(META_PREFIX + name, {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(meta));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function deleteMeta(root, name) {
  try {
    await root.removeEntry(META_PREFIX + name);
    return true;
  } catch {
    return false;
  }
}

export class OpfsCache {
  constructor() {
    this._root = null;
    this._persisted = false;
  }

  async init() {
    if (this._root !== null) return this._root !== false;
    const root = await getRoot();
    if (!root) {
      this._root = false;
      return false;
    }
    this._root = root;
    this._persisted = await requestPersistent();
    return true;
  }

  get available() {
    return this._root !== null && this._root !== false;
  }

  get persisted() {
    return this._persisted;
  }

  // Return the cached File for `key` if it is fully downloaded.
  // Returns null when the file is missing, partial, or unreadable.
  async get(key) {
    if (!(await this.init())) return null;
    const name = safeName(key);
    const meta = await readMeta(this._root, name);
    if (!meta || meta.version !== META_VERSION) return null;
    if (!meta.complete) return null;
    try {
      const handle = await this._root.getFileHandle(FILE_PREFIX + name);
      return await handle.getFile();
    } catch {
      return null;
    }
  }

  // Return the partial File for `key` so a caller can read the
  // bytes already downloaded and resume from the highest offset.
  // Returns { file, length } or null when nothing is on disk yet.
  async getPartial(key) {
    if (!(await this.init())) return null;
    const name = safeName(key);
    try {
      const handle = await this._root.getFileHandle(FILE_PREFIX + name);
      const file = await handle.getFile();
      return { file, length: file.size };
    } catch {
      return null;
    }
  }

  // Stream the entire model into OPFS using range requests. The
  // caller supplies a `fetchRange(offset, length)` that returns the
  // raw bytes for that slice — bitgpu uses this pattern internally
  // and we reuse the same primitive.
  //
  // The writer is sequential: it walks the file in chunks of
  // `chunkSize` (default 8 MiB), writes each one, and reports
  // progress to `onProgress(loaded, total)`. Cancellation: the
  // returned controller.abort() mid-flight drops the partial file
  // so the next attempt re-downloads from offset 0.
  async ingest(key, options = {}) {
    if (!(await this.init())) {
      throw new Error("OPFS unavailable");
    }
    const { totalSize, fetchRange, chunkSize, signal, onProgress } = options;
    validateIngestArgs(totalSize, fetchRange);
    const name = safeName(key);
    const writable = await this._prepareTarget(name);
    try {
      await this._writeChunks(writable, name, {
        totalSize, fetchRange, chunkSize, signal, onProgress,
      });
      await writeMeta(this._root, name, {
        version: META_VERSION,
        complete: true,
        size: totalSize,
        key,
        ts: Date.now(),
      });
      return { size: totalSize };
    } catch (error) {
      // Best-effort cleanup on failure so we never present a half-
      // written file as complete to the next call.
      try { await writable.abort?.(); } catch {}
      try { await this._root.removeEntry(FILE_PREFIX + name); } catch {}
      await deleteMeta(this._root, name);
      throw error;
    } finally {
      try { await writable.close?.(); } catch {}
    }
  }

  // Drop any prior partial file and open a fresh writable. The file
  // is empty at this point; chunks write at explicit positions.
  async _prepareTarget(name) {
    try { await this._root.removeEntry(FILE_PREFIX + name); } catch {}
    await deleteMeta(this._root, name);
    const handle = await this._root.getFileHandle(FILE_PREFIX + name, {
      create: true,
    });
    return handle.createWritable();
  }

  // Stream the model into the writable, walking in `chunkSize`
  // slices. Reports progress to `onProgress(loaded, totalSize)`.
  // Aborts cleanly when `signal` flips so the next attempt starts
  // from offset 0.
  async _writeChunks(writable, name, {
    totalSize, fetchRange, chunkSize = 8 * 1024 * 1024,
    signal, onProgress,
  }) {
    let loaded = 0;
    while (loaded < totalSize) {
      if (signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      const length = Math.min(chunkSize, totalSize - loaded);
      const bytes = await fetchRange(loaded, length);
      if (!(bytes instanceof ArrayBuffer)) {
        throw new Error("fetchRange must return ArrayBuffer");
      }
      if (bytes.byteLength !== length) {
        throw new Error(
          `fetchRange returned ${bytes.byteLength} bytes; expected ${length}`,
        );
      }
      await writable.write({
        type: "write",
        position: loaded,
        data: bytes,
      });
      loaded += length;
      if (typeof onProgress === "function") {
        onProgress(loaded, totalSize);
      }
    }
  }

  async clear(key) {
    if (!(await this.init())) return false;
    const name = safeName(key);
    let removed = false;
    for (const prefix of [FILE_PREFIX, META_PREFIX]) {
      try {
        await this._root.removeEntry(prefix + name);
        removed = true;
      } catch {}
    }
    return removed;
  }

  async clearAll() {
    if (!(await this.init())) return 0;
    let removed = 0;
    for await (const [name] of this._root.entries()) {
      if (!name.startsWith(FILE_PREFIX) && !name.startsWith(META_PREFIX)) {
        continue;
      }
      try {
        await this._root.removeEntry(name);
        removed++;
      } catch {}
    }
    return removed;
  }

  // Best-effort inventory. Used by the Settings panel to show disk
  // usage. Returns total bytes across every cached file (complete or
  // partial).
  async inventory() {
    if (!(await this.init())) return { available: false, files: [], bytes: 0 };
    const files = [];
    let bytes = 0;
    for await (const [name, handle] of this._root.entries()) {
      if (!name.startsWith(FILE_PREFIX)) continue;
      if (handle.kind !== "file") continue;
      try {
        const file = await handle.getFile();
        const meta = await readMeta(this._root, name.slice(FILE_PREFIX.length));
        files.push({
          name,
          size: file.size,
          complete: meta?.complete === true,
          ts: meta?.ts ?? null,
        });
        bytes += file.size;
      } catch {}
    }
    return { available: true, files, bytes, persisted: this._persisted };
  }
}
