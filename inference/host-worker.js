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
// rationale as round 65's worker-runtime default in plugin/webllm.
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

// OpfsCache is here for the future OPFS-backed fetch override. Round
// 69 dropped the active path because the vendored runtime's loader
// (`an.open({fetch, signal, cache, ...})`) owns its own gguf fetch
// and cache protocol; an OPFS override requires injecting a `fetch`
// callback that returns ArrayBuffer/File from OPFS, which the runtime
// exposes via `chat.runtime.fetch` for plugin code but not through
// `an.open`'s option shape. Keep the module in place so a follow-up
// can wire it through; for now the cache is just an inventory surface.
const opfs = new OpfsCache();

let engine = null;
let engineModel = null;
let bootPromise = null;
const registry = new SessionRegistry({ get engine() { return engine; } });
let state = HOST_STATE.IDLE;

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

function handleInit(requestId, { defaultModel, accessToken } = {}) {
  // Reply with the real request id — shell-side ensureHost() awaits
  // this on a pendingRequests entry keyed to the postMessage id, so
  // a stale hard-coded 0 here would deadlock every callHost() call
  // behind a never-resolving init promise (initPromise never settles,
  // the .then(worker => ...) inside callHost never fires, and the
  // shell's hostState cache still shows "ready" because PUSH.STATUS
  // pushes do work — masking the bug behind a misleading cache).
  postReply(requestId, { type: "ok", result: { initialized: true } });
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
  postPush(PUSH.STATUS, { state: nextState() });
  postReply(requestId, {
    type: "ok",
    result: {
      id: session.id,
      model: engineModel.id,
      contextLength: engine.contextLength,
    },
  });
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

function handleAbort(requestId, { sessionId } = {}) {
  // Per-session abort controllers aren't tracked yet. The consumer's
  // AbortSignal flows through session.send() and surfaces upstream.
  if (requestId !== undefined) postReply(requestId, { type: "ok", result: { ok: true } });
}

function handleReset(requestId, { sessionId }) {
  registry.get(sessionId)?.reset();
  if (requestId !== undefined) postReply(requestId, { type: "ok", result: { ok: true } });
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
        return handleInit(id, message);
      case REQUEST.LOAD:
        return await handleLoad(id, message);
      case REQUEST.UNLOAD:
        return handleUnload(id);
      case REQUEST.CREATE_SESSION:
        return await handleCreateSession(id, message);
      case REQUEST.SEND:
        return await handleSend(id, message);
      case REQUEST.ABORT:
        return handleAbort(id, message);
      case REQUEST.RESET:
        return handleReset(id, message);
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
