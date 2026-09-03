// Main-thread facade for worker.js. Its public surface matches Bonsai27B's chat wrapper.
import { loadBitgpuKernelSources } from "./kernel/sources.js";
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
    this.contextFull = false;
    this.lastAssistantContent = null;
    this.runtime = { getShaderSources: loadBitgpuKernelSources };
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
      this.loadResolve?.();
      this.loadResolve = this.loadReject = null;
      this.loadOptions = null;
      return;
    }
    if (message.type === "event") {
      if (message.event.type === "complete") {
        this.lastAssistantContent = message.event.result.text;
      }
      this.events.push(message.event);
      this.notify();
      return;
    }
    if (message.type === "generation-complete") {
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
    this.worker.postMessage({ type: "reset" });
  }

  async *streamTurn(messages, options) {
    this.events = [];
    this.generationDone = false;
    this.generationError = null;
    const { signal, ...workerOptions } = options;
    const abort = () => this.worker.postMessage({ type: "abort" });
    signal?.addEventListener("abort", abort, { once: true });
    this.worker.postMessage({
      type: "generate",
      messages,
      options: workerOptions,
    });
    try {
      while (!this.generationDone || this.events.length > 0) {
        if (this.events.length > 0) {
          yield this.events.shift();
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
