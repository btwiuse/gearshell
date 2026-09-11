// Browser-facing adapter around the bitgpu runtime extracted from
// index.html. Both entries use the same loader and cache protocol so
// they can share downloaded weights.
import {
  Bonsai27B as IndexBonsai27B,
  DEFAULT_GGUF_FILE,
  DEFAULT_MODEL_ID,
  resolveGGUFUrl,
} from "./index-runtime.js";

export { DEFAULT_GGUF_FILE, DEFAULT_MODEL_ID, resolveGGUFUrl };

function makeEventStream(runtimeChat, messages, options) {
  return (async function* () {
    let phase = "answer";
    let phaseBuffer = "";
    let collected = "";
    let tokenCount = 0;
    const openId = runtimeChat.thinkOpenTokenId;
    const closeId = runtimeChat.thinkCloseTokenId;
    for await (const update of runtimeChat.generate(messages, options)) {
      if (update.token === null) {
        if (update.delta) {
          if (phase === "think") {
            phaseBuffer += update.delta;
          } else {
            collected += update.delta;
          }
          yield { type: "text", delta: update.delta };
        }
        continue;
      }
      tokenCount += 1;
      if (phase === "answer") {
        if (openId !== null && update.token === openId) {
          phase = "think";
          phaseBuffer = "";
          continue;
        }
        if (update.delta) {
          collected += update.delta;
          yield { type: "text", delta: update.delta };
        }
      } else {
        if (closeId !== null && update.token === closeId) {
          phase = "answer";
          if (phaseBuffer) {
            yield { type: "thinking", delta: phaseBuffer };
            phaseBuffer = "";
          }
          const tail = "\n";
          collected += tail;
          yield { type: "text", delta: tail };
          continue;
        }
        if (update.delta) {
          phaseBuffer += update.delta;
          yield { type: "thinking", delta: update.delta };
        }
      }
    }
    if (phase === "think" && phaseBuffer) {
      yield { type: "thinking", delta: phaseBuffer };
    }
    return { tokens: new Array(tokenCount), text: collected };
  })();
}

function applyTemplateOverrides(runtimeChat, options) {
  if (!runtimeChat) return;
  const incoming = {};
  if (typeof options.think === "boolean") {
    incoming.enable_thinking = options.think;
  }
  const userArgs = options.chatTemplateArgs;
  if (userArgs && typeof userArgs === "object") {
    Object.assign(incoming, userArgs);
  }
  if (Object.keys(incoming).length === 0) return;
  runtimeChat.chatTemplateArgs = {
    ...runtimeChat.chatTemplateArgs,
    ...incoming,
  };
}

function stripLegacyOptions(options) {
  const {
    think: _think,
    thinkBudget: _thinkBudget,
    thinkEarlyStop: _thinkEarlyStop,
    tools: _tools,
    streamTools: _streamTools,
    chatTemplateArgs: _cta,
    ...rest
  } = options;
  return rest;
}

class BonsaiChat {
  constructor(runtimeChat, defaultGeneration = {}) {
    this.contextLength = runtimeChat.contextLength;
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.thinkOpenTokenId = runtimeChat.thinkOpenTokenId;
    this.thinkCloseTokenId = runtimeChat.thinkCloseTokenId;
    this.chatTemplateArgs = {};
    this._runtimeChat = runtimeChat;
    this._defaultGeneration = defaultGeneration;
    const runtime = runtimeChat.runtime ?? {};
    const shaderSources = async () => {
      const rendered = runtime.getRenderedShaders?.() ?? [];
      return rendered.filter((k) => !/\btranscode\b|\.transcode\./i.test(k.name));
    };
    this.runtime = {
      ...runtime,
      getShaderSources: shaderSources,
      getRenderedShaders: runtime.getRenderedShaders?.bind(runtime),
    };
  }

  reset() {
    this._runtimeChat.reset?.();
    this.contextFull = false;
    this.lastAssistantContent = null;
  }

  generate(messages, options = {}) {
    applyTemplateOverrides(this._runtimeChat, options);
    return this._runtimeChat.generate(messages, {
      ...this._defaultGeneration,
      ...stripLegacyOptions(options),
    });
  }

  async *streamTurn(messages, options = {}) {
    this.lastAssistantContent = null;
    applyTemplateOverrides(this._runtimeChat, options);
    const merged = { ...this._defaultGeneration, ...stripLegacyOptions(options) };
    const stream = makeEventStream(this._runtimeChat, messages, {
      ...merged,
      signal: options.signal,
    });
    try {
      for await (const event of stream) {
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

export class Bonsai27B {
  static async checkAvailability(source = null, options = {}) {
    return IndexBonsai27B.checkAvailability(source, options);
  }

  static async load(source = DEFAULT_MODEL_ID, options = {}) {
    const runtimeChat = await IndexBonsai27B.load(source, options);
    return new BonsaiChat(runtimeChat, options.defaultGeneration ?? {});
  }
}

export default Bonsai27B;
