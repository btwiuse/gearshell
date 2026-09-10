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

import { createEngineFor } from "./bitgpu-engine.js";
import { SessionRegistry } from "./session.js";
import { REQUEST, PUSH, HOST_STATE } from "./protocol.js";

let engine = null;
let engineModel = null;
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

async function handleLoad(requestId, { model, options }) {
  if (state === HOST_STATE.LOADING) {
    postReply(requestId, { type: "error", error: "already loading" });
    return;
  }
  setState(HOST_STATE.LOADING);
  try {
    const progress = (p) =>
      postPush(PUSH.PROGRESS, { requestId, progress: p });
    const chat = await createEngineFor(model, { ...options, onProgress: progress });
    engine = chat;
    engineModel = { id: model };
    setState(HOST_STATE.READY);
    postReply(requestId, {
      type: "ok",
      result: {
        model,
        contextLength: chat.contextLength,
      },
    });
  } catch (error) {
    setState(HOST_STATE.ERROR);
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

function handleCreateSession(requestId, { model, options }) {
  if (!engine) {
    postReply(requestId, { type: "error", error: "model not loaded" });
    return;
  }
  if (model && engineModel?.id !== model) {
    postReply(requestId, {
      type: "error",
      error: `host has ${engineModel?.id ?? "no"} model loaded; ${model} requested`,
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
  // Wire handles are needed for the shell to push abort/reset without
  // a fresh RPC. The host keeps the session in its registry by id; the
  // wire carries the id and methods that postMessage to the host.
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
  // The session registry doesn't keep per-session abort controllers
  // today (the consumer's AbortSignal flows through). Future: track
  // them if we add server-side aborts.
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
      case REQUEST.LOAD:
        return await handleLoad(id, message);
      case REQUEST.UNLOAD:
        return handleUnload(id);
      case REQUEST.CREATE_SESSION:
        return handleCreateSession(id, message);
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
// dispatching requests so it can sequence `load` before `createSession`.
postPush(PUSH.STATUS, { state: nextState() });
