// inference/host-worker.js — entry point for the inference host Web Worker.
//
// The worker is created once by the shell and lives for the duration of
// the page. It owns a single BitgpuChat (model instance) plus a session
// registry. Requests arrive as { id, type, ... } messages; replies are
// { id, type: "ok"|"error", ... }. Streaming events are pushed
// out-of-band as { type: "event", sessionId, event }.
//
// Why a Worker: bitgpu's WebGPU buffers live in the main thread by
// default, but inference runs on the GPU regardless of which thread
// dispatched the call. Hosting in a Worker keeps inference off the UI
// thread so paint throttling / markdown reparse / scroll handling on
// the consumer side cannot starve the GPU command queue — the same
// rationale as round 65's worker-runtime default in plugin/bonsai.
//
// Multi-model: only one model is resident at a time. A load() call
// while a model is already loaded first evicts the old one.
//
// Boot: the shell sends an init message `{ type: "init", defaultModel,
// accessToken }` once the Worker is up. If `defaultModel` is set the
// host kicks off a background load immediately so the first
// createSession() is fast. createSession() can still trigger a lazy
// load when the consumer names a different model — sessions created
// during a model swap wait on the new engine before they stream.

import { createEngineFor } from "./bitgpu-engine.js";
import { SessionRegistry } from "./session.js";
import { REQUEST, PUSH, HOST_STATE } from "./protocol.js";
import { OpfsCache } from "./opfs-cache.js";

// One OpfsCache instance per worker. Initialised lazily on first use
// so workers without storage.getDirectory (Safari < 102, sandboxed
// iframes) don't pay the init cost and degrade to Cache Storage.
const opfs = new OpfsCache();

let engine = null;
let engineModel = null;
let bootPromise = null;
const registry = new SessionRegistry({ get engine() { return engine; } });
let state = HOST_STATE.IDLE;
let requestSeq = 0;

function postReply(requestId, payload) {
  self.postMessage({ id: requestId, ...payload });
}

function postPush(type, payload) {
  self.postMessage({ type, ...payload });
}

function setState(next) {
  state = next;
  postPush(PUSH.STATUS, { state: nextState() });
}

function nextState() {
  return {
    state,
    model: engineModel ? { id: engineModel.id } : null,
    sessions: registry.status(),
  };
}

// Background boot of the requested model. Returns a promise that
// resolves once the model is resident or rejects on load error.
// Concurrent callers share the same promise so two `createSession`
// requests during the same boot don't double-spawn the load.
function ensureBoot(modelId, options) {
  if (engine && engineModel?.id === modelId) return Promise.resolve();
  if (bootPromise && engineModel?.id === modelId) return bootPromise;
  setState(HOST_STATE.LOADING);
  bootPromise = (async () => {
    try {
      const progress = (p) =>
        postPush(PUSH.PROGRESS, { modelId, progress: p });
      const chat = await createEngineFor(modelId, {
        ...options,
        onProgress: progress,
        // Hand the engine the shared OPFS cache so the bootstrapping
        // path can short-circuit on a fully-cached model and the
        // background path can populate OPFS from network on miss.
        opfs,
      });
      // Drop the previous engine (and any in-flight sessions) only
      // after the new one is resident. This avoids a window where
      // active sessions have no engine to read from.
      if (engine && engineModel?.id !== modelId) {
        registry.shutdown();
      }
      engine = chat;
      engineModel = { id: modelId };
      setState(HOST_STATE.READY);
    } catch (error) {
      setState(HOST_STATE.ERROR);
      throw error;
    } finally {
      bootPromise = null;
    }
  })();
  return bootPromise;
}

function handleInit({ defaultModel, accessToken } = {}) {
  postReply(0, { type: "ok", result: { initialized: true } });
  if (!defaultModel) return;
  // Fire-and-forget: surface progress events as PUSH.PROGRESS so the
  // shell can show a loader. If the load fails the state transition
  // to ERROR fires and the consumer's createSession() will see it.
  ensureBoot(defaultModel, { accessToken }).catch((error) => {
    postPush(PUSH.STATUS, {
      state: nextState(),
      error: String(error?.message ?? error),
    });
  });
}

async function handleLoad(requestId, { model, options }) {
  if (!model) {
    postReply(requestId, { type: "error", error: "model is required" });
    return;
  }
  try {
    await ensureBoot(model, options ?? {});
    postReply(requestId, {
      type: "ok",
      result: {
        model,
        contextLength: engine.contextLength,
      },
    });
  } catch (error) {
    postReply(requestId, {
      type: "error",
      error: String(error?.message ?? error),
    });
  }
}

async function handleUnload(requestId) {
  registry.shutdown();
  engine = null;
  engineModel = null;
  setState(HOST_STATE.IDLE);
  postReply(requestId, { type: "ok", result: { ok: true } });
}

async function handleCreateSession(requestId, { model, options }) {
  const targetModel = model ?? engineModel?.id;
  if (!targetModel) {
    postReply(requestId, {
      type: "error",
      error: "no model specified and none resident",
    });
    return;
  }
  try {
    if (!engine || engineModel?.id !== targetModel) {
      // Lazy load: requested model differs from resident. Wait for
      // the boot to complete before admitting the session. Bumps
      // LRU pressure but doesn't evict the previous engine until
      // the new one is ready (see ensureBoot).
      await ensureBoot(targetModel, options ?? {});
    }
  } catch (error) {
    postReply(requestId, {
      type: "error",
      error: String(error?.message ?? error),
    });
    return;
  }
  const session = registry.create({
    model: engineModel,
    options: options ?? {},
  });
  const wire = createSessionWire(session);
  postReply(requestId, {
    type: "ok",
    result: {
      id: session.id,
      model: engineModel.id,
      contextLength: engine.contextLength,
      wire,
    },
  });
}

function createSessionWire(session) {
  return {
    id: session.id,
    send(messages, options) {
      const requestId = ++requestSeq;
      self.postMessage({
        id: requestId,
        type: REQUEST.SEND,
        sessionId: session.id,
        messages,
        options: options ?? {},
      });
      return requestId;
    },
    abort() {
      self.postMessage({ type: REQUEST.ABORT, sessionId: session.id });
    },
    reset() {
      self.postMessage({ type: REQUEST.RESET, sessionId: session.id });
    },
    close() {
      self.postMessage({ type: REQUEST.CLOSE_SESSION, sessionId: session.id });
    },
  };
}

async function handleSend(requestId, { sessionId, messages, options }) {
  const session = registry.get(sessionId);
  if (!session) {
    postReply(requestId, { type: "error", error: `no such session: ${sessionId}` });
    return;
  }
  postReply(requestId, { type: "ok", result: { ok: true } });
  try {
    for await (const event of session.send(messages, options)) {
      postPush(PUSH.EVENT, { sessionId, event });
    }
    postPush(PUSH.EVENT, { sessionId, event: { type: "_end" } });
  } catch (error) {
    postPush(PUSH.EVENT, {
      sessionId,
      event: { type: "_error", error: String(error?.message ?? error) },
    });
  }
}

function handleAbort({ sessionId }) {
  // Per-session abort controllers aren't tracked yet. The consumer's
  // AbortSignal flows through session.send() and surfaces upstream.
}

function handleReset({ sessionId }) {
  registry.get(sessionId)?.reset();
}

function handleCloseSession(requestId, { sessionId }) {
  const dropped = registry.drop(sessionId);
  postReply(requestId, { type: "ok", result: { dropped } });
}

function handleStatus(requestId) {
  postReply(requestId, { type: "ok", result: nextState() });
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  const { id, type } = message;
  try {
    switch (type) {
      case "init":
        return handleInit(message);
      case REQUEST.LOAD:
        return await handleLoad(id, message);
      case REQUEST.UNLOAD:
        return handleUnload(id);
      case REQUEST.CREATE_SESSION:
        return await handleCreateSession(id, message);
      case REQUEST.SEND:
        return await handleSend(id, message);
      case REQUEST.ABORT:
        return handleAbort(message);
      case REQUEST.RESET:
        return handleReset(message);
      case REQUEST.CLOSE_SESSION:
        return handleCloseSession(id, message);
      case REQUEST.STATUS:
        return handleStatus(id);
      default:
        if (id) postReply(id, { type: "error", error: `unknown: ${type}` });
    }
  } catch (error) {
    if (id) {
      postReply(id, { type: "error", error: String(error?.message ?? error) });
    }
  }
});

// Tell the shell we're alive. The shell waits for this before it starts
// dispatching requests so it can sequence `init` before `createSession`.
postPush(PUSH.STATUS, { state: nextState() });
