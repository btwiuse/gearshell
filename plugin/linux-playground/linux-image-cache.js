const DATABASE = "gearshell-linux-images";
const STORE = "archives";

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionAsPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed.")), { once: true });
  });
}

async function openDatabase() {
  const request = indexedDB.open(DATABASE, 1);
  request.addEventListener("upgradeneeded", () => request.result.createObjectStore(STORE), { once: true });
  return requestAsPromise(request);
}

async function readArchive(url) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readonly");
  const archive = await requestAsPromise(transaction.objectStore(STORE).get(url));
  await transactionAsPromise(transaction);
  database.close();
  return archive || null;
}

async function writeArchive(url, archive) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put(archive, url);
  await transactionAsPromise(transaction);
  database.close();
}

export async function loadLinuxArchive(url, onProgress = () => {}) {
  if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable in this browser.");
  const cached = await readArchive(url);
  if (cached) {
    onProgress({ cached: true, loaded: cached.size, total: cached.size });
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) {
    const archive = await response.blob();
    await writeArchive(url, archive);
    onProgress({ cached: false, loaded: archive.size, total: archive.size });
    return archive;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress({ cached: false, loaded, total });
  }
  const archive = new Blob(chunks, { type: "application/gzip" });
  await writeArchive(url, archive);
  onProgress({ cached: false, loaded: archive.size, total: archive.size });
  return archive;
}
