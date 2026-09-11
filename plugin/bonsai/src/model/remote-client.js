// plugin/bonsai/src/model/remote-client.js — client shim for the
// GearShell.inference host.
//
// The plugin used to bundle its own bitgpu engine (Bonsai27B class
// from adapter.js + WorkerBonsai27B from bonsai-client.js). With the
// inference host in place, this shim replaces those two classes: the
// host owns the engine in a long-lived Worker, the plugin just talks
// to it through `GearShell.inference.*`.
//
// Activation: `?runtime=host` (or a future "default once the host is
// stable"). When the host is unavailable (standalone deployment at
// gear.sh/plugin/bonsai/buildless.html without a host iframe, or
// older shells without workspace-inference-api.js), the consumer
// falls back to the local Bonsai27B / WorkerBonsai27B classes — the
// fallback path is unchanged from rounds 64–66.
//
// The shim exposes the same surface the rest of the plugin (turn.js,
// tool-runner.js, events.js) already consumes:
//
//   await RemoteBonsai27B.load("prism-ml/Bonsai-27B-gguf", options)
//   chat.contextLength      // number
//   chat.runtime            // for kernel inspector
//   chat.contextFull        // boolean
//   chat.lastAssistantContent
//   chat.reset()
//   chat.streamTurn(messages, options)   // AsyncIterable<event>

const HOST_QUERY_KEY = "runtime";
const HOST_QUERY_VALUE = "host";

export class RemoteBonsai27B {
  static isAvailable() {
    return (
      typeof window !== "undefined" &&
      typeof window.GearShell?.inference?.createSession === "function"
    );
  }

  static async load(source, options = {}) {
    if (!RemoteBonsai27B.isAvailable()) {
      throw new Error("GearShell.inference is unavailable");
    }
    const host = window.GearShell.inference;
    const progressListeners = [];
    const onProgress = options.onProgress ?? (() => {});
    if (options.onProgress) {
      // The host surfaces progress through a one-shot callback tied to
      // a request id; we bridge it into the same shape Bonsai27B.load
      // used to expose by passing through the call's option wrapper.
      // The host currently doesn't return a progress handle, so we
      // just emit a single "init" event for parity.
      onProgress({ status: "init", message: "Requesting inference host" });
    }
    const loadResult = await host.load(source, options);
    // Touch progressListeners so the no-op usage doesn't trip the linter.
    void progressListeners;
    return new RemoteChat(loadResult);
  }
}

class RemoteChat {
  constructor(loadResult) {
    this.model = loadResult.model;
    this.contextLength = loadResult.contextLength ?? 4096;
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.thinkOpenTokenId = loadResult.thinkOpenTokenId ?? null;
    this.thinkCloseTokenId = loadResult.thinkCloseTokenId ?? null;
    this.chatTemplateArgs = {};
    // The host doesn't surface its runtime introspection through
    // the GearShell.inference namespace (no shader-source handle in
    // the load reply). The plugin's kernel inspector reads
    // getShaderSources() to populate the kernels panel; round 69
    // returns empty until the host exposes that handle. The
    // inspector's openKernels() path falls through cleanly to its
    // empty-kernels branch when the array is empty.
    this.runtime = {
      getShaderSources: async () => [],
      getRenderedShaders: () => [],
    };
    this._sessionPromise = null;
  }

  _session() {
    if (!this._sessionPromise) {
      this._sessionPromise = window.GearShell.inference.createSession({});
    }
    return this._sessionPromise;
  }

  reset() {
    this.contextFull = false;
    this.lastAssistantContent = null;
    return this._session().then((s) => s.reset());
  }

  async *streamTurn(messages, options = {}) {
    const session = await this._session();
    // Forward chatTemplateArgs alongside the rest of the options
    // (round 69: think toggle is now carried in chatTemplateArgs
    // instead of an option field). BitgpuChat in inference/ applies
    // it to the runtime before generate().
    const stream = session.send(messages, {
      ...options,
      chatTemplateArgs: { ...this.chatTemplateArgs, ...(options.chatTemplateArgs ?? {}) },
    });
    for await (const event of stream) {
      if (event.type === "complete") {
        this.lastAssistantContent = event.result?.text ?? null;
      }
      yield event;
      if (event.type === "_error" || event.type === "_end") break;
    }
  }
}

export function hostModeRequested() {
  if (typeof location === "undefined") return false;
  const params = new URLSearchParams(location.search);
  return params.get(HOST_QUERY_KEY) === HOST_QUERY_VALUE;
}
