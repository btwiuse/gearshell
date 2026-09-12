function normalizeEndpoint(baseURL) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  if (!base) throw new Error("remote provider requires a base URL");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function messageContent(message) {
  return typeof message?.content === "string" ? message.content : "";
}

function usageMetrics(usage) {
  return {
    tokens: Number(usage?.completion_tokens) || 0,
    tps: 0,
    ttft: null,
  };
}

export class RemoteChat {
  constructor(model) {
    this.model = model;
    this.contextLength = model.contextLength || 0;
    this.contextFull = false;
  }

  reset() {
    this.contextFull = false;
  }

  dispose() {
    this.model.apiKey = "";
  }

  async *streamTurn(messages, options = {}) {
    const { signal, think: _think, generation: _generation, ...generation } = options;
    const response = await fetch(normalizeEndpoint(this.model.baseURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.model.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model.model,
        messages: messages.map((message) => ({
          role: message.role,
          content: messageContent(message),
        })),
        stream: false,
        ...generation,
      }),
      signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Remote API ${response.status}: ${detail || response.statusText}`);
    }
    const data = await response.json();
    const text = messageContent(data?.choices?.[0]?.message);
    if (text) yield { type: "text", delta: text };
    yield {
      type: "complete",
      result: { tokens: [], text, metrics: usageMetrics(data?.usage) },
    };
  }
}

export function createRemoteEngine(model) {
  const provider = model?.providerName || model?.providerId;
  if (!model?.apiKey) throw new Error(`remote provider "${provider}" has no API key`);
  if (!model?.baseURL) throw new Error(`remote provider "${provider}" has no base URL`);
  return new RemoteChat(model);
}
