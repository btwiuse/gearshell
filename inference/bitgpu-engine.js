// inference/bitgpu-engine.js — bitgpu runtime adapter (vendored).
//
// Wraps the same bitgpu runtime that plugin/webllm ships (vendored as
// ./runtime.js by scripts/extract-runtime.mjs). Round 67 originally
// imported from the jsDelivr CDN, but the plugin switched to a
// vendored copy in dc54cd2 so the host followed suit here.
//
// Round 70 (webllm cutover): plugin/bonsai was replaced by
// plugin/webllm; the bonsai runtime source moved from a vendored
// index.html extract (plugin/bonsai/src/model/index-runtime.js) to
// plugin/webllm/bonsai-27b.js. The runtime is shipped as a CLASSIC
// script (sets globalThis side effects, no `export` statements). To
// bridge the gap between the host's module Worker and the classic
// runtime body, scripts/extract-runtime.mjs appends an ES module
// shim after the vendored classic body that re-exports the runtime's
// globals. So `import { Bonsai27B, BonsaiResolveGGUFUrl, ... } from
// "./runtime.js"` works.
//
// Round 69 port notes (vs round 67):
// - Runtime source: CDN → ./runtime.js (vendored). One extraction step
//   per bitgpu upgrade, see scripts/extract-runtime.mjs.
// - Chat API: `chat.stream(messages, {onThink})` →
//   `chat.generate(messages, options)` which yields cumulative
//   `{phase, text, rawText}` snapshots. The host emits text deltas
//   between successive snapshots for its stable event protocol.
// - Think toggle: now goes through `chatTemplateArgs.enable_thinking`
//   instead of the `{think}` option (round 69, plugin commit 4cd0869).
//   The host's streamTurn maps `options.think` to chatTemplateArgs
//   before calling generate().
// - Tools: dropped. The vendored runtime's protocol doesn't carry
//   tool calls; tool use lives in the consumer's
//   `GearShell.bash.run` etc., which the plugin's `tools.js`
//   dispatches before each turn. The host inherits that pattern via
//   the plugin's adapter — `GearShell.inference.*` is for chat
//   streaming only, not for tool orchestration.
// - OPFS Blob URL: dropped. The vendored runtime's loader
//   (`an.open`) owns the GGUF fetch + cache protocol; it accepts
//   `fetch` and `signal` options and writes through Cache Storage
//   itself. Re-introducing an OPFS path requires a fetch override
//   that exposes `File`/`FileSystemFileHandle` — deferred to a
//   follow-up commit when the runtime's loader surfaces the right
//   hook. The OPFS module (inference/opfs-cache.js) stays in place
//   for when that hook lands.

import {
  Bonsai27B as IndexBonsai27B,
  DEFAULT_GGUF_FILE,
  DEFAULT_MODEL_ID,
  BonsaiResolveGGUFUrl as resolveGGUFUrl,
} from "./runtime.js";
import {
  getModel,
} from "./manifest.js";

export { DEFAULT_GGUF_FILE, DEFAULT_MODEL_ID, resolveGGUFUrl };

const DEFAULT_CONTEXT_LENGTH = 4096;

function createProgressReporter(onProgress) {
  return (progress) => {
    if (progress.status === "weights") {
      onProgress({
        status: "weights",
        kind: progress.kind ?? "bytes",
        loaded: progress.loaded ?? null,
        total: progress.total ?? null,
        message: progress.message ?? "Streaming weights",
      });
      return;
    }
    if (progress.status === "tokenizer") {
      onProgress({
        status: "weights",
        kind: "tensors",
        message: progress.message ?? "Loading tokenizer",
      });
      return;
    }
    if (progress.status === "ready") {
      onProgress({ status: "ready", message: "Ready", fraction: 1 });
    }
  };
}

// Wraps the vendored runtime's chat object so callers (the session
// registry in session.js) get the same stream/events contract
// Bonsai27B exposes from the plugin's adapter. The translation
// lives in streamNativeEvents() below.
export class BitgpuChat {
  constructor(runtimeChat, defaultGeneration = {}) {
    this.runtimeChat = runtimeChat;
    this.contextLength = runtimeChat.contextLength;
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.thinkOpenTokenId = runtimeChat.thinkOpenTokenId ?? null;
    this.thinkCloseTokenId = runtimeChat.thinkCloseTokenId ?? null;
    this.runtime = runtimeChat.runtime;
    this.defaultGeneration = defaultGeneration;
  }

  reset() {
    this.runtimeChat.reset?.();
    this.contextFull = false;
    this.lastAssistantContent = null;
  }

  // Map `options.think` onto chatTemplateArgs.enable_thinking, then
  // strip the legacy options (`think`, `thinkBudget`,
  // `thinkEarlyStop`, `tools`, `streamTools`, `chatTemplateArgs`)
  // that the vendored runtime doesn't read. Mirrors
  // plugin/bonsai/src/model/adapter.js:69-97 — the plugin made the
  // same shape change in commit 4cd0869.
  prepareOptions(options) {
    const chatTemplateArgs = {
      ...this.runtimeChat.chatTemplateArgs,
    };
    if (typeof options.think === "boolean") {
      chatTemplateArgs.enable_thinking = options.think;
      chatTemplateArgs.preserve_thinking = options.think;
    }
    if (options.chatTemplateArgs && typeof options.chatTemplateArgs === "object") {
      Object.assign(chatTemplateArgs, options.chatTemplateArgs);
    }
    const {
      think: _think,
      thinkBudget: _thinkBudget,
      thinkEarlyStop: _thinkEarlyStop,
      tools: _tools,
      streamTools: _streamTools,
      chatTemplateArgs: _cta,
      ...rest
    } = options;
    return { ...rest, chatTemplateArgs };
  }

  async *streamTurn(messages, options = {}) {
    this.lastAssistantContent = null;
    const prepared = this.prepareOptions(options);
    const merged = { ...this.defaultGeneration, ...prepared };
    try {
      for await (
        const event of streamNativeEvents(this.runtimeChat, messages, merged)
      ) {
        if (event.type === "text" || event.type === "thinking") {
          if (event.delta) {
            this.lastAssistantContent = (this.lastAssistantContent ?? "") + event.delta;
          }
        }
        yield event;
      }
      yield {
        type: "complete",
        result: { tokens: [], text: this.lastAssistantContent ?? "" },
      };
    } catch (error) {
      if (options.signal?.aborted) return;
      if (/context/i.test(String(error?.message ?? error))) {
        this.contextFull = true;
      }
      throw error;
    }
  }
}

// The vendored runtime's current `chat.generate(messages, options)`
// yields snapshots (`{ phase, text, rawText }`), not the older
// `{ token, delta }` updates. Translate successive visible-text
// snapshots into deltas for the host's stable streaming API.
async function* streamNativeEvents(runtimeChat, messages, options) {
  let previous = "";
  for await (const update of runtimeChat.generate(messages, options)) {
    if (update?.phase === "prefill") continue;
    const text = String(update?.text ?? "");
    const delta = text.startsWith(previous)
      ? text.slice(previous.length)
      : text;
    previous = text;
    if (delta) yield { type: "text", delta };
  }
}

export async function createEngineFor(modelId, options = {}) {
  const model = getModel(modelId);
  if (!model) throw new Error(`unknown model: ${modelId}`);

  const onProgress = options.onProgress ?? (() => {});
  const { runtimeChat, defaultGeneration } = await bootBitgpuEngine(
    modelId, model, options,
  );
  onProgress({ status: "ready", message: "Ready", fraction: 1 });
  return new BitgpuChat(runtimeChat, defaultGeneration);
}

// Load the GGUF + tokenizer and return the raw runtime chat. Split
// out of createEngineFor() to keep that function under the
// 50-line rule.
async function bootBitgpuEngine(modelId, model, options) {
  const onProgress = createProgressReporter(options.onProgress ?? (() => {}));
  // The vendored runtime's loader accepts the same `onProgress` shape
  // the plugin's adapter passes — convert our flat shape into the
  // shape IndexBonsai27B expects.
  const runtimeOptions = {
    ...options,
    file: model.ggufFile,
    maxLength: model.ctx,
    onProgress,
  };
  const runtimeChat = await IndexBonsai27B.load(modelId, runtimeOptions);
  return {
    runtimeChat,
    defaultGeneration: model.defaultGeneration ?? {},
  };
}

// Re-export the legacy URL/tokenizer helpers from the runtime so the
// host's protocol surface (workspace-inference-api.js, etc.) keeps
// the same shape it had in round 67.
export {
  IndexBonsai27B as Bonsai27B,
};
