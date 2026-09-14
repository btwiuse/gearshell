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
// explicit _awake only if it never does. Calling _awake while the element
// self-activates RACES allocation and panics the kernel ("Response body
// object should not be disturbed or locked") — mirror the bridge's
// wakeTask exactly: poll rid, only _awake after the timeout.
async function waitReady(entry) {
  const deadline = Date.now() + 30000;
  while (!entry.session.task.rid && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (entry.session.task.rid) return;
  entry.session.started = true;
  try {
    await entry.session.task._awake?.();
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
