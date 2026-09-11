// inference/bitgpu-engine.js — bitgpu runtime adapter.
//
// Lifted from plugin/bonsai/src/model/adapter.js with the file-input
// path removed (the host never sees a Blob — file loads are client
// responsibilities). Exposes a single factory `createEngineFor(modelId,
// options)` that returns the bitgpu chat object ready for streaming.
//
// The factory is intentionally synchronous-friendly: it returns the
// chat object plus a progress callback the host can re-emit as
// postMessage progress events to the shell.

import { createEngine } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/index.js";
import { createChat } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/chat.js";
import { fromGguf } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/gguf.js";
import {
  getModel,
  resolveGgufUrl,
  tokenizerDirectory,
} from "./manifest.js";

const DEFAULT_CONTEXT_LENGTH = 4096;

function createProgressReporter(onProgress) {
  return (progress) => {
    if (progress.phase === "weights" && Number.isFinite(progress.loaded)) {
      onProgress({
        status: "weights",
        kind: "bytes",
        loaded: progress.loaded,
        total: progress.total ?? null,
        message: "Streaming weights",
      });
      return;
    }
    if (progress.phase === "pipelines") {
      onProgress({
        status: "weights",
        kind: "tensors",
        message: "Compiling WebGPU kernels",
      });
    }
  };
}

function assertOverflowSupported(model, overflow) {
  // The Bonsai-27B qwen3_5 hybrid backbone doesn't support sinks. Mirror
  // the upstream adapter's check so callers get an explicit error before
  // bitgpu allocates GPU buffers.
  if (model?.id === "prism-ml/Bonsai-27B-gguf" && overflow === "sinks") {
    throw new Error(
      "bitgpu: overflow 'sinks' is not supported by Bonsai-27B's qwen3_5 hybrid backbone. Remove ?overflow=sinks.",
    );
  }
}

async function resolveModelSource(model, onProgress) {
  const useOfficialManifest = model.id === "prism-ml/Bonsai-27B-gguf";
  onProgress({
    status: "init",
    message: useOfficialManifest ? "Loading model manifest" : "Parsing GGUF header",
  });
  const sourceSpec = useOfficialManifest
    ? { manifestUrl: model.manifestUrl, auxUrl: model.auxUrl }
    : await fromGguf(model.ggufUrl, { fetchRange: model.fetchRange });
  return { sourceSpec, useOfficialManifest };
}

// Wraps bitgpu's chat object so callers (the session registry in
// session.js) get the same stream/events contract Bonsai27B used to
// expose from the plugin's adapter. The `runtime` getter is kept so
// the kernel inspector in the plugin can introspect compiled WGSL.
export class BitgpuChat {
  constructor(engine, nativeChat, defaultGeneration = {}) {
    this.engine = engine;
    this.nativeChat = nativeChat;
    this.defaultGeneration = defaultGeneration;
    this.contextLength = engine.capabilities.maxSeqLen;
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.runtime = engine.runtime;
  }

  reset() {
    this.nativeChat.reset();
    this.contextFull = false;
    this.lastAssistantContent = null;
  }

  async *streamTurn(messages, options = {}) {
    try {
      for await (
        const event of streamNativeEvents(this.nativeChat, messages, {
          ...this.defaultGeneration,
          ...options,
        })
      ) {
        if (event.type === "complete") {
          this.lastAssistantContent = event.result.text;
        }
        yield event;
      }
    } catch (error) {
      if (options.signal?.aborted) return;
      if (/maxSeqLen|context/i.test(String(error?.message ?? error))) {
        this.contextFull = true;
      }
      throw error;
    }
  }
}

async function* streamNativeEvents(nativeChat, messages, options) {
  // bitgpu's chat.stream returns an async generator where each `value`
  // is a text delta; onThink fires as a callback. Normalise the two
  // into a single typed-event stream the rest of the host can consume
  // without knowing bitgpu's exact shape.
  const queue = [];
  let wake = null;
  let failure = null;

  const push = (event) => {
    queue.push(event);
    wake?.();
    wake = null;
  };
  const wait = () =>
    new Promise((resolve) => {
      wake = resolve;
    });

  // Run the native producer in the background. `_finished` is the
  // sentinel that closes the loop. We capture the producer's failure
  // (if any) and rethrow after the queue drains.
  let producerDone;
  const producer = runNativeProducer(nativeChat, messages, options, push)
    .then((err) => {
      producerDone = true;
      failure = err;
    });

  while (!producerDone || queue.length > 0) {
    if (queue.length === 0) {
      await wait();
      continue;
    }
    const event = queue.shift();
    if (event.type === "_finished") break;
    yield event;
  }
  await producer;
  if (failure) throw failure;
}

async function runNativeProducer(nativeChat, messages, options, push) {
  let failure = null;
  try {
    const stream = nativeChat.stream(messages, {
      ...options,
      onThink: (delta) => {
        if (delta) push({ type: "thinking", delta });
      },
    });
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        push({ type: "complete", result: next.value });
        break;
      }
      if (next.value) push({ type: "text", delta: next.value });
    }
  } catch (error) {
    failure = error;
  } finally {
    push({ type: "_finished" });
  }
  return failure;
}

export async function createEngineFor(modelId, options = {}) {
  const model = getModel(modelId);
  if (!model) throw new Error(`unknown model: ${modelId}`);

  const { engine, nativeChat, useOfficialManifest } = await bootBitgpuEngine(
    modelId, model, options,
  );
  onProgressReady(options.onProgress);

  const chat = new BitgpuChat(
    engine,
    nativeChat,
    useOfficialManifest ? model.defaultGeneration : undefined,
  );
  scheduleOpfsIngest(modelId, model, options);
  return chat;
}

// Resolve the model file URL, create the bitgpu engine, and load the
// tokenizer. Returns the raw bitgpu handles so the caller can wrap
// them in BitgpuChat. Split out of createEngineFor() to keep that
// function under the 50-line rule.
async function bootBitgpuEngine(modelId, model, options) {
  const onProgress = options.onProgress ?? (() => {});
  const ggufUrl = await resolveDataUrl(
    modelId, model, options.accessToken, options.opfs,
  );
  assertOverflowSupported(model, options.overflow);

  const request = options.fetch ?? defaultFetch({
    accessToken: options.accessToken,
    opfs: options.opfs,
  });
  const { sourceSpec, useOfficialManifest } = await resolveModelSource(model, onProgress);

  onProgress({ status: "init", message: "Requesting WebGPU device" });
  const engine = await createEngine({
    ...sourceSpec,
    dataUrl: ggufUrl,
    maxSeqLen: options.maxLength ?? DEFAULT_CONTEXT_LENGTH,
    kvCache: options.kvCache ?? model.runtime.kvCache,
    activation: options.activation ?? model.runtime.activation,
    overflow: options.overflow ?? model.runtime.overflow,
    onProgress: createProgressReporter(onProgress),
    fetchStream: request.fetchStream,
  });

  onProgress({ status: "tokenizer", message: "Loading tokenizer" });
  const nativeChat = await createChat(engine, {
    modelUrl: tokenizerDirectory(modelId, ggufUrl),
    fetchJson: request.fetchJson,
  });
  return { engine, nativeChat, useOfficialManifest };
}

function onProgressReady(onProgress) {
  onProgress?.({ status: "ready", message: "Ready", fraction: 1 });
}

// Fire-and-forget OPFS ingest after the engine is up. The first
// inference uses the network; subsequent loads hit OPFS instead.
// Errors are swallowed: a failed ingest means we re-download next
// time, which is the same fallback we'd hit without OPFS at all.
function scheduleOpfsIngest(modelId, model, options) {
  if (!options.opfs) return;
  const ggufUrl = resolveGgufUrl(modelId, model.ggufFile);
  if (!ggufUrl.startsWith("http")) return;
  backgroundIngestOpfs(modelId, model, {
    opfs: options.opfs,
    accessToken: options.accessToken,
    signal: options.signal,
    onProgress: options.onOpfsProgress,
  }).catch(() => {});
}

// Default fetch pipeline: HTTP-only with Cache Storage tier. The
// plugin's fetch.js had this; we replicate the minimum the host needs
// and let session/opfs-cache.js add a persistent tier on top.
function defaultFetch({ accessToken, opfs } = {}) {
  const CACHE_NAME = "gguf-cache-v1";
  async function openCache() {
    if (typeof caches === "undefined") return null;
    return caches.open(CACHE_NAME).catch(() => null);
  }
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
  return {
    async fetchJson(url) {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`fetchJson ${url}: ${response.status}`);
      return response.json();
    },
    async fetchStream(url) {
      const store = await openCache();
      if (store) {
        const cached = await store.match(url);
        if (cached?.body) return cached.body;
      }
      const response = await fetch(url, { headers });
      if (!response.body) {
        throw new Error(`Response body for ${url} is unavailable.`);
      }
      if (store) store.put(url, response.clone()).catch(() => {});
      return response.body;
    },
  };
}

// Resolve the dataUrl passed to bitgpu. If OPFS holds a complete
// cached copy, return a Blob URL pointing at it so bitgpu's WGPUBuffer
// upload happens via SyncAccessHandle (zero-copy). Otherwise return
// the upstream-resolved URL and leave OPFS caching for a follow-up
// ingestion pass.
export async function resolveDataUrl(modelId, model, accessToken, opfs) {
  const ggufUrl = resolveGgufUrl(modelId, model.ggufFile);
  if (!opfs) return ggufUrl;
  try {
    await opfs.init();
  } catch {
    return ggufUrl;
  }
  const cached = await opfs.get(ggufUrl);
  if (cached instanceof File) {
    return URL.createObjectURL(cached);
  }
  return ggufUrl;
}

// Background OPFS ingest: streams the GGUF into the on-disk tier
// while bitgpu is reading from the network. Called after the engine
// has been created so the warm-cache path (Blob URL → bitgpu) doesn't
// block the first inference. Subsequent loads hit the OPFS path.
export async function backgroundIngestOpfs(modelId, model, options = {}) {
  const { opfs, accessToken, signal, onProgress } = options;
  if (!opfs) return;
  try {
    await opfs.init();
  } catch {
    return;
  }
  const ggufUrl = resolveGgufUrl(modelId, model.ggufFile);
  const existing = await opfs.get(ggufUrl);
  if (existing instanceof File) return;
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
  try {
    // HEAD to learn total size. We trust the GGUF server to expose
    // Content-Length on the full-file GET (most HF mirrors do).
    const head = await fetch(ggufUrl, { method: "HEAD", headers });
    const totalSize = Number(head.headers.get("content-length"));
    if (!Number.isFinite(totalSize) || totalSize <= 0) return;
    await opfs.ingest(ggufUrl, {
      totalSize,
      signal,
      onProgress,
      fetchRange: async (offset, length) => {
        const response = await fetch(ggufUrl, {
          headers: {
            ...headers,
            Range: `bytes=${offset}-${offset + length - 1}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Range ${offset}+${length} failed: ${response.status}`);
        }
        return await response.arrayBuffer();
      },
    });
  } catch {
    // Best-effort: a failed ingest just means we re-download next
    // time. Don't surface to the consumer — they're already chatting.
  }
}
