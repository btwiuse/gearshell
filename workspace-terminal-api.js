// workspace-terminal-api.js — the terminal session surface of
// window.GearShell for same-document callers (Home demo, panel plugins).
//
// `terminal.create(profile?)` returns a session id for a headless kernel
// terminal the caller renders with its own xterm (via the shared
// xterm-bundle.mjs). Output flows to local onData/onExit listeners;
// input rides terminal.write; winch rides terminal.resize. The pump is a
// faithful mirror of the proven iframe bridge in workspace-terminal-
// bridge.js (waitFor the term device, openReadable/openWritable the data
// path, forward chunks), so it shares the exact kernel-stream semantics.
//
// The whole surface is sync-decorated like the rest of the jsfs-bridged
// API: window.GearShell wraps every method in `safe()`, so thrown errors
// surface as { ok:false, error } rather than killing the caller.
// create/connect is fire-and-forget — the pump connects asynchronously,
// data/exit listeners may race it, so output is buffered until the first
// listener attaches.

import { attachKernelTermStream } from "./kernel-term-stream.mjs";
import { getDockviewApi } from "./app-panels-store.js";
import {
  createHeadlessTerminalSession,
  destroyTerminalSession,
} from "./app-terminal-sessions.js";
import {
  getDefaultTerminalProfile,
} from "./app-terminal-profiles.js";

const sessions = new Map();
let sessionCounter = 0;

function requireDockview() {
  if (!getDockviewApi()) throw new Error("terminal.create requires a mounted dockview");
}

function emit(entry, type, payload) {
  const listeners = entry.listeners[type];
  if (listeners.size === 0) {
    entry.pending.push(payload);
    return;
  }
  for (const listener of listeners) listener(payload);
}

// Wait for the task element to allocate (its rid), falling back to an
// explicit _awake only if it never does. _awake() has its own
// `if (this.rid) return;` guard so a direct call is idempotent — the
// legacy 250ms polling existed for the case where an iframe created a
// session before the element's connect-chain microtask ran; we now
// await the kernel's ready promise (covers cold-boot) then call
// _awake() directly. No timer.
async function waitReady(entry) {
  const task = entry.session.task;
  const kernelHost = task._kernelHost ||
    task.closest?.("wanix-system, wanix-namespace");
  if (kernelHost?._kernelReady) {
    await kernelHost._kernelReady;
  } else if (!task._kernel) {
    await new Promise((resolve) => queueMicrotask(resolve));
  }
  if (task.rid) return;
  if (!task._kernel) return;
  entry.session.started = true;
  try {
    await task._awake?.();
  } catch {}
}

function createTerminal(profileArg) {
  requireDockview();
  const id = `api-${++sessionCounter}`;
  const profile = {
    ...getDefaultTerminalProfile(),
    ...(profileArg && typeof profileArg === "object" ? profileArg : {}),
  };
  // Reuse the headless session factory the iframe bridge uses: same task
  // + term device, no wanix-term DOM (the caller renders its own xterm).
  const session = createHeadlessTerminalSession(id, profile);
  const entry = {
    id,
    session,
    stream: null,
    disposed: false,
    pending: [],
    listeners: { data: new Set(), exit: new Set() },
  };
  sessions.set(id, entry);
  entry.stream = attachKernelTermStream({
    paths: {
      data: () => `#task/repl-${id}/term/data`,
      winch: () => `#task/repl-${id}/term/winch`,
      exit: () => `#task/repl-${id}/exit`,
    },
    beforeConnect: () => waitReady(entry),
    onChunk: (value) => {
      if (value?.length) emit(entry, "data", value);
    },
    onStreamEnd: () => {
      if (entry.disposed) return;
      emit(entry, "exit", { code: null });
      disposeTerminal(id);
    },
    onConnectError: (error) => {
      if (entry.disposed) return;
      emit(entry, "exit", { code: null, error: error?.message || String(error) });
      disposeTerminal(id);
    },
  });
  return { ok: true, sessionId: id };
}

function writeTerminal(id, data) {
  const entry = sessions.get(String(id));
  if (!entry?.stream?.isConnected()) {
    throw new Error("terminal session is not connected yet");
  }
  entry.stream.write(data).catch(() => {
    // kernel stream closed; the pump teardown handles the rest
  });
  return { ok: true };
}

async function resizeTerminal(id, cols, rows, xpixel = 0, ypixel = 0) {
  const entry = sessions.get(String(id));
  if (!entry) throw new Error(`unknown terminal session: ${id}`);
  await waitReady(entry);
  await entry.stream.writeWinch(cols, rows, xpixel, ypixel);
  return { ok: true };
}

function disposeTerminal(id) {
  const entry = sessions.get(String(id));
  if (!entry) return { ok: true };
  entry.disposed = true;
  entry.stream?.dispose();
  destroyTerminalSession(entry.session.id);
  sessions.delete(String(id));
  return { ok: true };
}

function subscribe(id, type, listener) {
  const entry = sessions.get(String(id));
  if (!entry || typeof listener !== "function") return { ok: false };
  entry.listeners[type].add(listener);
  if (type === "data" && entry.pending.length) {
    for (const payload of entry.pending.splice(0)) listener(payload);
  }
  return { ok: true };
}
function unsubscribe(id, type, listener) {
  sessions.get(String(id))?.listeners[type].delete(listener);
  return { ok: true };
}

export const terminalApi = {
  create: createTerminal,
  write: writeTerminal,
  resize: resizeTerminal,
  dispose: disposeTerminal,
  list: () => ({ ok: true, sessions: [...sessions.keys()] }),
  onData: (id, listener) => subscribe(id, "data", listener),
  offData: (id, listener) => unsubscribe(id, "data", listener),
  onExit: (id, listener) => subscribe(id, "exit", listener),
  offExit: (id, listener) => unsubscribe(id, "exit", listener),
};
