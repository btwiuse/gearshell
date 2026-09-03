const CACHE_NAMES = [
  "bonsai-model-weights-v1",
  "gguf-cache-v1",
  "gguf-v1",
  "gguf-v1-headers",
];
const CHUNKS_STORE = "chunks";
const CACHE_DB = "gguf-cache-v1";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(index < 2 ? 0 : 2)} ${units[index]}`;
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getChunkCount() {
  try {
    const db = await openCacheDb();
    if (!db.objectStoreNames.contains(CHUNKS_STORE)) return 0;
    const transaction = db.transaction(CHUNKS_STORE, "readonly");
    const count = await requestValue(transaction.objectStore(CHUNKS_STORE).count());
    db.close();
    return count;
  } catch {
    return 0;
  }
}

async function getCacheEntries() {
  const entries = [];
  for (const name of CACHE_NAMES) {
    if (!(await caches.has(name))) continue;
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    for (const key of keys) {
      const response = await cache.match(key);
      bytes += Number(response?.headers.get("content-length")) || 0;
    }
    entries.push({ name, count: keys.length, bytes });
  }
  return entries;
}

export async function describeModelCache() {
  const [entries, chunks, estimate, persisted] = await Promise.all([
    getCacheEntries(),
    getChunkCount(),
    navigator.storage?.estimate?.(),
    navigator.storage?.persisted?.(),
  ]);
  const lines = entries.length === 0
    ? ["Cache Storage: no Bonsai entries"]
    : entries.map((entry) =>
      `Cache Storage ${entry.name}: ${entry.count} item(s), ${formatBytes(entry.bytes)}`
    );
  lines.push(`IndexedDB ${CACHE_DB}: ${chunks} chunk record(s)`);
  lines.push(`Origin storage: ${formatBytes(estimate?.usage)} / ${formatBytes(estimate?.quota)}`);
  lines.push(`Offline retention: ${persisted ? "granted" : "not granted"}`);
  return lines.join("\n");
}

export async function requestPersistentModelCache() {
  const granted = await navigator.storage?.persist?.();
  return granted === true;
}

export async function clearModelCache() {
  await Promise.all(CACHE_NAMES.map((name) => caches.delete(name)));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(CACHE_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
