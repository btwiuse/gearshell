// workspace-inference-api.js — GearShell.inference.* on the shell side.
//
// Spawns a single long-lived inference host Worker (inference/host-worker.js)
// and exposes its capabilities as the standard GearShell namespace:
//
//   await GearShell.inference.list()              // [{id, label, size, ...}]
//   await GearShell.inference.bootstrap({model})  // pre-warm: load default
//   await GearShell.inference.load(model, opts)   // explicit load
//   await GearShell.inference.unload()            // frees VRAM
//   await GearShell.inference.status()            // {state, model, sessions} — cached
//   const session = await GearShell.inference.createSession({model, ...})
//   for await (const event of session.send(messages, options)) { ... }
//   session.abort(); session.reset(); session.close();
//
// `status()` resolves from a shell-side cache that mirrors the
// worker's PUSH.STATUS pushes, so the playground's probe never
// queues behind a busy worker (the worker can be stuck streaming
// a 3.8 GB model load and still owe status replies indefinitely).
//
// Stream events arrive as `{ type: "text"|"thinking"|"tool_call"|"complete", ... }`,
// matching the shape the plugin's adapter used to emit — see the
// migration in plugin/bonsai/src/model/remote-client.js.

import { listModels } from "./inference/manifest.js";
import { REQUEST, PUSH } from "./inference/protocol.js";
import { emit } from "./workspace-events.js";

const HOST_URL = new URL("./inference/host-worker.js", import.meta.url);

// Stored config the host was initialised with. The shell's
// `inference.bootstrap()` (or any first call that needs the engine)
// flushes this to the worker. `null` means the host is up but no
// default model was selected — consumers must call load() or pass
// `model` to createSession() explicitly.
let hostConfig = null;
let workerInstance = null;
let initPromise = null;
let nextRequestId = 0;
const pendingRequests = new Map();
const sessionStreams = new Map(); // sessionId -> Set<(event) => void>

// Cached host state mirrored from the worker's PUSH.STATUS pushes.
// The worker is authoritative for {state, model, sessions} and
// fires PUSH.STATUS on every transition (load/unload/createSession/
// closeSession/boot). `status()` reads this cache and resolves
// immediately, so the playground's status probe never gets blocked
// behind a 3.8 GB model load in the worker's message queue.
// Shape matches the documented contract:
//   { state, model: {id}|null, sessions: [{id, model, messages, lastUsedAt}] }
let hostState = { state: "idle", model: null, sessions: [] };

function ensureHost(config) {
  if (config) hostConfig = { ...hostConfig, ...config };
  if (workerInstance) return initPromise;
  if (!initPromise) {
    initPromise = (async () => {
      const worker = new Worker(HOST_URL, { type: "module" });
      worker.addEventListener("message", (event) => onHostMessage(event.data));
      worker.addEventListener("error", (event) => {
        // Surface fatal worker errors. Pending requests see them.
        const err = String(event?.message ?? event);
        for (const [, pending] of pendingRequests) {
          pending.reject(new Error(`host worker error: ${err}`));
        }
        pendingRequests.clear();
      });
      workerInstance = worker;
      // Send init with the stored config so the host can pre-warm.
      if (hostConfig?.defaultModel) {
        await new Promise((resolve) => {
          const id = ++nextRequestId;
          pendingRequests.set(id, {
            resolve: () => resolve(),
            reject: () => resolve(),
          });
          worker.postMessage({
            id,
            type: REQUEST.INIT,
            defaultModel: hostConfig.defaultModel,
            accessToken: hostConfig.accessToken,
          });
        });
      }
      return worker;
    })();
  }
  return initPromise;
}

function onHostMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === PUSH.EVENT) {
    const listeners = sessionStreams.get(message.sessionId);
    if (listeners) {
      for (const fn of [...listeners]) {
        try { fn(message.event); } catch {}
      }
    }
    emit("inference.event", {
      sessionId: message.sessionId,
      event: message.event,
    });
    return;
  }
  if (message.type === PUSH.PROGRESS) {
    // Background loads (from init or earlier bootstrap) don't have a
    // pending request id; surface progress as an event so the shell
    // can render a loader. Tagged with the model id from the message.
    emit("inference.progress", message);
    return;
  }
  if (message.type === PUSH.STATUS) {
    // Cache the full status blob; status() resolves from this
    // snapshot instead of round-tripping the worker. See hostState.
    if (message.state && typeof message.state === "object") {
      hostState = message.state;
    } else if (typeof message.state === "string") {
      // Defensive: if the worker ever ships a bare string again,
      // preserve the existing model/sessions and just update state.
      hostState = { ...hostState, state: message.state };
    }
    emit("inference.status", hostState);
    return;
  }
  if (typeof message.id === "number") {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.type === "ok") pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? "inference host error"));
  }
}

function callHost(type, payload) {
  return ensureHost().then(
    (worker) =>
      new Promise((resolve, reject) => {
        const id = ++nextRequestId;
        pendingRequests.set(id, { resolve, reject });
        worker.postMessage({ id, type, ...payload });
      }),
  );
}

// Each shell-side session wraps a session id with a streaming
// AsyncIterable `send()` method. Streams are sent via RPC
// (callHost(REQUEST.SEND)) and events arrive on the PUSH channel
// via the sessionStreams dispatch table.
//
// Note: the worker previously returned a `wire` object whose methods
// (send/abort/reset/close) were functions — but postMessage structured
// cloning strips functions, so by the time the shell saw the wire
// every method was undefined and the playground's createSession()
// crashed on the first call. We do the RPC dance entirely on the
// shell side now; the worker's createSession reply carries only
// {id, model, contextLength}.
class RemoteSession {
  constructor({ id, model, contextLength }) {
    this.id = id;
    this.model = model;
    this.contextLength = contextLength;
    this._listeners = new Set();
    sessionStreams.set(id, this._listeners);
  }

  send(messages, options = {}) {
    // Returns an AsyncIterable. The host pushes typed events; we yield
    // them to the consumer. The host also pushes {type:"_end"} or
    // {type:"_error", error} which signal stream completion.
    const listeners = this._listeners;
    const sessionId = this.id;
    const queue = [];
    let wake = null;
    let closed = false;
    const push = (event) => {
      queue.push(event);
      if (wake) { const w = wake; wake = null; w(); }
    };
    const onEvent = (event) => {
      if (event.type === "_end") closed = true;
      push(event);
    };
    listeners.add(onEvent);
    // Kick off the worker-side stream. Errors before the worker acks
    // surface synchronously through this Promise; once acked, errors
    // come through {type:"_error"} events.
    callHost(REQUEST.SEND, { sessionId, messages, options }).catch((error) => {
      push({ type: "_error", error: error?.message ?? String(error) });
      push({ type: "_end" });
    });
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        if (queue.length > 0) {
          const event = queue.shift();
          if (event.type === "_end") return { done: true, value: undefined };
          if (event.type === "_error") throw new Error(event.error);
          return { done: false, value: event };
        }
        if (closed) return { done: true, value: undefined };
        return new Promise((resolve) => {
          wake = () => {
            if (queue.length === 0) {
              resolve({ done: true, value: undefined });
              return;
            }
            const event = queue.shift();
            if (event.type === "_end") resolve({ done: true, value: undefined });
            else if (event.type === "_error") resolve(Promise.reject(new Error(event.error)));
            else resolve({ done: false, value: event });
          };
        });
      },
      async return() {
        listeners.delete(onEvent);
        if (listeners.size === 0) sessionStreams.delete(sessionId);
        // Best-effort abort so the worker doesn't keep streaming for
        // a consumer that walked off mid-stream. The worker treats
        // ABORT as a no-op for now (see handleAbort) but we send it
        // so a future worker that respects it gets the signal.
        callHost(REQUEST.ABORT, { sessionId }).catch(() => {});
        return { done: true, value: undefined };
      },
    };
  }

  abort() {
    return callHost(REQUEST.ABORT, { sessionId: this.id }).catch(() => {});
  }
  reset() {
    return callHost(REQUEST.RESET, { sessionId: this.id }).catch(() => {});
  }
  close() {
    sessionStreams.delete(this.id);
    return callHost(REQUEST.CLOSE_SESSION, { sessionId: this.id }).catch(() => {});
  }
}

export const inferenceApi = {
  list() {
    return Promise.resolve(listModels());
  },

  status() {
    // Returns the cached host state synchronously (resolved as a
    // Promise to keep the API async-only). The worker pushes
    // PUSH.STATUS on every transition, so this is always fresh
    // unless the host was never booted — in which case the cache
    // holds the default IDLE snapshot.
    //
    // The worker ships `sessions` as the registry's full status
    // object ({count, max, sessions: [...]}). Flatten to the
    // playground-catalog contract (a flat session list) so callers
    // don't have to know about the inner shape.
    const raw = hostState.sessions;
    const sessions = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.sessions)
      ? raw.sessions
      : [];
    return Promise.resolve({ ...hostState, sessions });
  },

  // Pre-warm the host with a default model. Called once at shell boot
  // (or whenever the user changes their preferred default). The
  // background load streams progress as `inference.progress` events;
  // first createSession() is then near-instant. Calling bootstrap
  // again with a different model triggers a model swap.
  bootstrap(options = {}) {
    hostConfig = { ...hostConfig, ...options };
    return callHost(REQUEST.LOAD, {
      model: hostConfig.defaultModel,
      options: { accessToken: hostConfig.accessToken },
    });
  },

  load(model, options = {}) {
    return callHost(REQUEST.LOAD, { model, options });
  },

  unload() {
    return callHost(REQUEST.UNLOAD, {});
  },

  createSessionInfo(options = {}) {
    return callHost(REQUEST.CREATE_SESSION, {
      model: options.model,
      options,
    });
  },

  send(sessionId, messages, options = {}) {
    return callHost(REQUEST.SEND, { sessionId, messages, options });
  },

  abort(sessionId) {
    return callHost(REQUEST.ABORT, { sessionId });
  },

  reset(sessionId) {
    return callHost(REQUEST.RESET, { sessionId });
  },

  closeSession(sessionId) {
    sessionStreams.delete(sessionId);
    return callHost(REQUEST.CLOSE_SESSION, { sessionId });
  },

  async createSession(options = {}) {
    const session = await this.createSessionInfo(options);
    return new RemoteSession(session);
  },
};

export default inferenceApi;
