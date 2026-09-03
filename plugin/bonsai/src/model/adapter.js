// Browser-facing adapter around the published bitgpu runtime.
//
// Keeping this layer local makes the app's model URL, Hugging Face token handling,
// and UI stream contract explicit while the GPU implementation stays version-pinned on CDN.
import { createEngine } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/index.js";
import { createChat } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/chat.js";
import { fromGguf } from "https://cdn.jsdelivr.net/npm/bitgpu@0.19.1/dist/gguf.js";
import { BONSAI_27B, resolveGgufUrl, tokenizerDirectory } from "./catalog.js";
import { createModelFetch } from "./fetch.js";
import { streamChatEvents } from "../chat/events.js";
import { loadBitgpuKernelSources } from "./kernel/sources.js";

export const DEFAULT_MODEL_ID = BONSAI_27B.id;
export const DEFAULT_GGUF_FILE = BONSAI_27B.ggufFile;
export { resolveGgufUrl as resolveGGUFUrl } from "./catalog.js";

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

function assertOverflowSupported(source, overflow) {
  if (source === BONSAI_27B.id && overflow === "sinks") {
    throw new Error(
      "bitgpu: overflow 'sinks' is not supported by Bonsai-27B's qwen3_5 hybrid backbone. Remove ?overflow=sinks.",
    );
  }
}

async function resolveModelSource(source, ggufUrl, request, onProgress) {
  const useOfficialManifest = source === BONSAI_27B.id;
  onProgress({
    status: "init",
    message: useOfficialManifest ? "Loading model manifest" : "Parsing GGUF header",
  });
  const model = useOfficialManifest
    ? { manifestUrl: BONSAI_27B.manifestUrl, auxUrl: BONSAI_27B.auxUrl }
    : await fromGguf(ggufUrl, { fetchRange: request.fetchRange });
  return { model, useOfficialManifest };
}

class BonsaiChat {
  constructor(engine, nativeChat, defaultGeneration = {}) {
    this.engine = engine;
    this.nativeChat = nativeChat;
    this.defaultGeneration = defaultGeneration;
    this.contextLength = engine.capabilities.maxSeqLen;
    this.contextFull = false;
    this.lastAssistantContent = null;

    this.runtime = { getShaderSources: loadBitgpuKernelSources };
  }

  reset() {
    this.nativeChat.reset();
    this.contextFull = false;
    this.lastAssistantContent = null;
  }

  async *streamTurn(messages, options = {}) {
    try {
      for await (
        const event of streamChatEvents(
          this.nativeChat,
          messages,
          { ...this.defaultGeneration, ...options },
        )
      ) {
        if (event.type === "complete") {
          this.lastAssistantContent = event.result.text;
        }
        yield event;
      }
    } catch (error) {
      if (/maxSeqLen|context/i.test(String(error?.message ?? error))) {
        this.contextFull = true;
      }
      throw error;
    }
  }
}

export class Bonsai27B {
  static async checkAvailability() {
    if (!navigator.gpu) {
      return {
        ok: false,
        reason: "WebGPU isn't available in this browser. Try a recent Chrome or Edge.",
      };
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      return {
        ok: false,
        reason: "No WebGPU adapter is available on this device.",
      };
    }
    return { ok: true };
  }

  static async load(source = DEFAULT_MODEL_ID, options = {}) {
    const onProgress = options.onProgress ?? (() => {});
    const ggufUrl = resolveGgufUrl(source, options.file);
    assertOverflowSupported(source, options.overflow);
    const request = createModelFetch({
      accessToken: options.accessToken,
      cache: options.cache,
      signal: options.signal,
    });

    const { model, useOfficialManifest } = await resolveModelSource(
      source,
      ggufUrl,
      request,
      onProgress,
    );

    onProgress({ status: "init", message: "Requesting WebGPU device" });
    const runtime = source === BONSAI_27B.id ? BONSAI_27B.runtime : { kvCache: "q8" };
    const engine = await createEngine({
      ...model,
      dataUrl: ggufUrl,
      maxSeqLen: options.maxLength ?? DEFAULT_CONTEXT_LENGTH,
      kvCache: options.kvCache ?? runtime.kvCache,
      // bitgpu falls back to f32 automatically when shader-f16 is unavailable.
      activation: options.activation ?? runtime.activation,
      overflow: options.overflow ?? runtime.overflow,
      onProgress: createProgressReporter(onProgress),
      fetchStream: request.fetchStream,
    });

    onProgress({ status: "tokenizer", message: "Loading tokenizer" });
    const nativeChat = await createChat(engine, {
      modelUrl: tokenizerDirectory(source, ggufUrl),
      fetchJson: request.fetchJson,
    });

    onProgress({ status: "ready", message: "Ready", fraction: 1 });
    return new BonsaiChat(
      engine,
      nativeChat,
      useOfficialManifest ? BONSAI_27B.defaultGeneration : undefined,
    );
  }
}

export default Bonsai27B;
