const CACHE_NAME = "bonsai-model-weights-v1";

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
  navigator.storage?.persist?.().catch(() => {});
  return caches.open(CACHE_NAME).catch(() => null);
}

// GGUF header reads use HTTP ranges. Cache Storage only stores the full weight response,
// so range reads remain network requests while the streaming payload is cached after first load.
export function createModelFetch({ accessToken, cache = true, signal } = {}) {
  const request = authenticatedFetch(accessToken, signal);
  const store = openCache(cache);

  return {
    async fetchRange(url, offset, length) {
      const response = await request(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      return response.arrayBuffer();
    },
    async fetchJson(url) {
      return (await request(url)).json();
    },
    async fetchStream(url) {
      const cacheStore = await store;
      const cached = await cacheStore?.match(url);
      if (cached?.body) return cached.body;

      const response = await request(url);
      if (!response.body) {
        throw new Error(`Response body for ${url} is unavailable.`);
      }
      cacheStore?.put(url, response.clone()).catch(() => {});
      return response.body;
    },
  };
}

export async function clearModelCache() {
  if (globalThis.caches) await caches.delete(CACHE_NAME);
}
