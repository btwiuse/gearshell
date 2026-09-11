// Main-thread facade for worker.js. The Worker drives the runtime's
// token stream directly (chat.generate); the facade translates the
// update stream back into the plugin's streamTurn event protocol so
// app.js / turn.js keep working without upstream changes.
export class WorkerBonsai27B {
  static async checkAvailability(...args) {
    return globalThis.navigator?.gpu
      ? { ok: true }
      : { ok: false, reason: "WebGPU isn't available in this browser." };
  }

  static async load(source, options = {}) {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    const client = new WorkerChatClient(worker);
    try {
      await client.load(source, options);
      return client;
    } catch (error) {
      worker.terminate();
      throw error;
    }
  }
}

class WorkerChatClient {
  constructor(worker) {
    this.worker = worker;
    this.contextLength = 0;
    this.thinkOpenTokenId = null;
    this.thinkCloseTokenId = null;
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.chatTemplateArgs = {};
    this.runtime = {
      getShaderSources: async () => [],
      getRenderedShaders: () => [],
    };
    this.events = [];
    this.wake = null;
    this.loadResolve = null;
    this.loadReject = null;
    this.generationError = null;
    this.generationDone = false;
    worker.addEventListener("message", ({ data }) => this.receive(data));
    worker.addEventListener(
      "error",
      (event) => this.fail(event.error ?? event.message),
    );
  }

  load(source, options) {
    return new Promise((resolve, reject) => {
      const { onProgress, ...workerOptions } = options;
      if (workerOptions.file instanceof Blob) {
        reject(new Error("LOAD FROM DISK is not supported with the worker runtime."));
        return;
      }
      this.loadOptions = { onProgress };
      this.loadResolve = resolve;
      this.loadReject = reject;
      this.worker.postMessage({ type: "load", source, options: workerOptions });
    });
  }

  receive(message) {
    if (message.type === "progress") {
      this.loadOptions?.onProgress?.(message.progress);
      return;
    }
    if (message.type === "ready") {
      this.contextLength = message.contextLength;
      this.thinkOpenTokenId = message.thinkOpenTokenId ?? null;
      this.thinkCloseTokenId = message.thinkCloseTokenId ?? null;
      this.loadResolve?.();
      this.loadResolve = this.loadReject = null;
      this.loadOptions = null;
      return;
    }
    if (message.type === "update") {
      const update = message.update;
      if (update.token !== null) {
        this.events.push({
          type: "token",
          id: update.token,
          delta: update.delta ?? "",
        });
      } else if (update.delta) {
        this.events.push({ type: "text", delta: update.delta });
      }
      this.notify();
      return;
    }
    if (message.type === "generation-complete") {
      this.lastAssistantContent = message.lastAssistantContent ?? null;
      const collected = this.lastAssistantContent ?? "";
      this.events.push({
        type: "complete",
        result: { tokens: [], text: collected },
      });
      this.generationDone = true;
      this.notify();
      return;
    }
    if (message.type === "error") {
      this.contextFull = message.contextFull === true;
      this.fail(new Error(message.message));
    }
  }

  fail(error) {
    if (this.loadReject) {
      this.loadReject(error);
      this.loadResolve = this.loadReject = null;
      this.loadOptions = null;
    } else {
      this.generationError = error;
      this.generationDone = true;
      this.notify();
    }
  }

  notify() {
    this.wake?.();
    this.wake = null;
  }

  reset() {
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.chatTemplateArgs = {};
    this.worker.postMessage({ type: "reset" });
  }

  async *streamTurn(messages, options = {}) {
    this.events = [];
    this.generationDone = false;
    this.generationError = null;
    let phase = "answer";
    let phaseBuffer = "";
    const { signal, ...workerOptions } = options;
    const abort = () => this.worker.postMessage({ type: "abort" });
    signal?.addEventListener("abort", abort, { once: true });
    this.worker.postMessage({
      type: "generate",
      messages,
      options: workerOptions,
      chatTemplateArgs: this.chatTemplateArgs,
    });
    try {
      while (!this.generationDone || this.events.length > 0) {
        if (this.events.length > 0) {
          const ev = this.events.shift();
          if (ev.type === "token") {
            if (phase === "answer" && this.thinkOpenTokenId !== null && ev.id === this.thinkOpenTokenId) {
              phase = "think";
              phaseBuffer = "";
              continue;
            }
            if (phase === "think" && this.thinkCloseTokenId !== null && ev.id === this.thinkCloseTokenId) {
              phase = "answer";
              if (phaseBuffer) {
                yield { type: "thinking", delta: phaseBuffer };
                phaseBuffer = "";
              }
              const tail = "\n";
              yield { type: "text", delta: tail };
              this.lastAssistantContent = (this.lastAssistantContent ?? "") + tail;
              continue;
            }
            if (phase === "think") {
              phaseBuffer += ev.delta;
              yield { type: "thinking", delta: ev.delta };
            } else {
              this.lastAssistantContent = (this.lastAssistantContent ?? "") + ev.delta;
              yield { type: "text", delta: ev.delta };
            }
            continue;
          }
          yield ev;
        } else {
          await new Promise((resolve) => {
            this.wake = resolve;
          });
        }
      }
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    if (this.generationError) throw this.generationError;
  }

  abort() {
    this.worker.postMessage({ type: "abort" });
  }
}
