const CACHE_NAME = "bonsai-model-weights-v1";
const BITGPU_CACHE_NAME = "gguf-cache-v1";

async function ensurePersistent() {
  if (!navigator.storage?.persist) return;
  if (await navigator.storage.persisted?.()) return;
  try { await navigator.storage.persist(); } catch {}
}

function authenticatedFetch(accessToken, signal) {
  return async (url, init = {}) => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const response = await fetch(url, { ...init, headers, signal });
    if (!response.ok) {
      throw new Error(`Request for ${url} failed: HTTP ${response.status}`);
    }
    return response;
  };
}

async function openCache(enabled) {
  if (!enabled || !globalThis.caches) return null;
  ensurePersistent();
  return caches.open(CACHE_NAME).catch(() => null);
}

// GGUF header reads use HTTP ranges. Cache Storage only stores the full weight response,
// so range reads remain network requests while the streaming payload is cached after first load.
export function createModelFetch({ accessToken, cache = true, signal, sourceFile = null, ggufUrl = null } = {}) {
  const request = sourceFile ? localRequest(sourceFile) : authenticatedFetch(accessToken, signal);
  const store = sourceFile ? null : openCache(cache);
  const url = ggufUrl;

  return {
    async fetchRange(url, offset, length) {
      const response = await request(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      return response.arrayBuffer();
    },
    async fetchJson(url) {
      if (sourceFile) {
        throw new Error("fetchJson is not available when loading a local GGUF file.");
      }
      return (await request(url)).json();
    },
    async fetchStream(targetUrl) {
      const cacheStore = await store;
      const cacheKey = url ?? targetUrl;
      const cached = cacheStore ? await cacheStore.match(cacheKey) : null;
      if (cached?.body) return cached.body;

      const response = await request(targetUrl ?? cacheKey);
      if (!response.body) {
        throw new Error(`Response body for ${targetUrl ?? cacheKey} is unavailable.`);
      }
      cacheStore?.put(cacheKey, response.clone()).catch(() => {});
      return response.body;
    },
  };
}

function localRequest(file) {
  return async (url) => {
    if (url && /^https?:/i.test(url) && !url.startsWith("blob:")) {
      throw new Error(
        "A local GGUF file is selected; remote fetches are disabled until you reload the page.",
      );
    }
    return new Response(file, { status: 200, statusText: "OK" });
  };
}

export async function clearModelCache() {
  if (globalThis.caches) await caches.delete(CACHE_NAME);
  if (globalThis.caches) await caches.delete(BITGPU_CACHE_NAME);
  if (globalThis.caches) await caches.delete("gguf-v1");
  if (globalThis.caches) await caches.delete("gguf-v1-headers");
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(BITGPU_CACHE_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
