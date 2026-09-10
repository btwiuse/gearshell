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

  const onProgress = options.onProgress ?? (() => {});
  const ggufUrl = resolveGgufUrl(modelId, model.ggufFile);
  assertOverflowSupported(model, options.overflow);

  const request = options.fetch ?? defaultFetch({ accessToken: options.accessToken });
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

  onProgress({ status: "ready", message: "Ready", fraction: 1 });
  return new BitgpuChat(
    engine,
    nativeChat,
    useOfficialManifest ? model.defaultGeneration : undefined,
  );
}

// Default fetch pipeline: HTTP-only with Cache Storage tier. The
// plugin's fetch.js had this; we replicate the minimum the host needs
// and let session/opfs-cache.js add a persistent tier on top.
function defaultFetch({ accessToken } = {}) {
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
