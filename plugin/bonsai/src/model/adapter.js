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

const TOOL_INSTRUCTION = [
  "You may call tools to read files, run shell commands, or query the",
  "workspace. To call a tool, output a single JSON object on its own",
  "line wrapped in <tool_call>...</tool_call> (no markdown fence):",
  "",
  ' <tool_call>{"name":"<tool_name>","arguments":{...}}</tool_call>',
  "",
  "After tool execution you receive a message with role \"tool\"; continue",
  "your reply based on that result. Do not invent tool outputs.",
  "",
].join("\n");

function toolCallOpenPattern() {
  return new RegExp("<[\\s]*tool[_\\s-]*call[\\s>]", "i");
}

function extractToolCalls(text) {
  if (typeof text !== "string" || text.length === 0) return { calls: [], cleaned: "" };
  const calls = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.slice(cursor).match(/<[\s]*tool[\s_-]*call[\s>]/i);
    if (!open) break;
    const start = cursor + open.index;
    const close = text.slice(start).match(/<\/[\s]*tool[\s_-]*call[\s]*>/i);
    let end;
    let body;
    if (close) {
      end = start + close.index + close[0].length;
      body = text.slice(start + open[0].length, start + close.index);
    } else {
      const afterOpen = start + open[0].length;
      const balanced = extractBalancedJsonObject(text, afterOpen);
      if (balanced) {
        body = text.slice(afterOpen, balanced.end);
        end = balanced.end;
      } else {
        body = text.slice(afterOpen);
        end = text.length;
      }
    }
    cursor = end;
    const raw = body.trim();
    if (!raw) continue;
    let parsedCall = null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.name === "string") {
        parsedCall = {
          name: obj.name,
          arguments: obj.arguments && typeof obj.arguments === "object" ? obj.arguments : {},
        };
      }
    } catch {}
    if (!parsedCall) {
      const loose = raw.match(/"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*\})/);
      if (loose) {
        try {
          parsedCall = { name: loose[1], arguments: JSON.parse(loose[2]) };
        } catch {}
      }
    }
    if (!parsedCall) {
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/);
      const argsMatch = raw.match(/"arguments"\s*:\s*(\{[\s\S]*\})/);
      if (nameMatch && argsMatch) {
        try {
          parsedCall = { name: nameMatch[1], arguments: JSON.parse(argsMatch[1]) };
        } catch {}
      }
    }
    if (parsedCall) calls.push(parsedCall);
  }
  let cleaned = text;
  let cursor2 = 0;
  while (cursor2 < text.length) {
    const open = text.slice(cursor2).match(/<[\s]*tool[\s_-]*call[\s>]/i);
    if (!open) break;
    const start = cursor2 + open.index;
    const close = text.slice(start).match(/<\/[\s]*tool[\s_-]*call[\s]*>/i);
    let end;
    if (close) {
      end = start + close.index + close[0].length;
    } else {
      const afterOpen = start + open[0].length;
      const balanced = extractBalancedJsonObject(text, afterOpen);
      end = balanced ? balanced.end : text.length;
    }
    cleaned = cleaned.replace(text.slice(start, end), "");
    cursor2 = end;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return { calls, cleaned };
}

function extractBalancedJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") { depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0) return { end: i + 1 };
    }
  }
  return null;
}

function normaliseToolSchema(tools) {
  if (!Array.isArray(tools)) return [];
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    if (tool.type === "function" && tool.function && typeof tool.function === "object") {
      out.push(tool.function);
      continue;
    }
    if (typeof tool.name === "string") {
      out.push(tool);
      continue;
    }
  }
  return out;
}

function buildToolSystemPrompt(tools) {
  const schema = normaliseToolSchema(tools);
  if (schema.length === 0) return null;
  const lines = [
    TOOL_INSTRUCTION,
    "<tools>",
    JSON.stringify(schema, null, 2),
    "</tools>",
    "",
  ];
  return lines.join("\n");
}

function mergeSystemPrompt(messages, systemPromptAddition) {
  if (!systemPromptAddition) return messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: "system", content: systemPromptAddition }];
  }
  const out = messages.slice();
  const first = out[0];
  if (first && first.role === "system") {
    out[0] = {
      ...first,
      content: `${first.content ?? ""}\n\n${systemPromptAddition}`,
    };
    return out;
  }
  out.unshift({ role: "system", content: systemPromptAddition });
  return out;
}

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
    const tools = normaliseToolSchema(options.tools);
    const conversation = tools.length > 0
      ? mergeSystemPrompt(messages, buildToolSystemPrompt(tools))
      : messages;
    const merged = { ...this._defaultGeneration, ...stripLegacyOptions(options) };
    const innerSignal = new AbortController();
    const onAbort = () => innerSignal.abort();
    if (options.signal) {
      if (options.signal.aborted) innerSignal.abort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    const stream = makeEventStream(this._runtimeChat, conversation, {
      ...merged,
      signal: innerSignal.signal,
    });
    let collectedText = "";
    try {
      for await (const event of stream) {
        if (event.type === "text" || event.type === "thinking") {
          if (event.delta) {
            collectedText += event.delta;
            this.lastAssistantContent = (this.lastAssistantContent ?? "") + event.delta;
          }
        }
        if (event.type === "text") {
          const parsed = extractToolCalls(collectedText);
          if (parsed.calls.length > 0) {
            innerSignal.abort();
            for (const call of parsed.calls) {
              this.lastAssistantContent = parsed.cleaned || "";
              yield {
                type: "tool_call",
                call: { name: call.name, arguments: call.arguments },
              };
            }
            return;
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
    } finally {
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
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
