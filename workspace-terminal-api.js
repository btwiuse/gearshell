// workspace-terminal-api.js — the terminal embed + session surface of
// window.GearShell for same-document callers (Home demo, panel plugins).
//
// `terminal.embed(anchor, profile?)` mounts a real wanix terminal into a
// caller-supplied DOM element — the original in-page surface, kept for
// backward compatibility (bbtex and other plugins still use it).
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

import { getDockviewApi } from "./app-panels-store.js";
import {
  attachTerminalSession,
  createHeadlessTerminalSession,
  destroyTerminalSession,
} from "./app-terminal-sessions.js";
import {
  getDefaultTerminalProfile,
} from "./app-terminal-profiles.js";
import { getWanixRoot } from "./app-state.js";

const sessions = new Map();
let sessionCounter = 0;

function requireDockview() {
  if (!getDockviewApi()) throw new Error("terminal.create requires a mounted dockview");
}
function dataPath(id) {
  return `#task/repl-${id}/term/data`;
}
function winchPath(id) {
  return `#task/repl-${id}/term/winch`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  while (!entry.session.task.rid && Date.now() < deadline) await sleep(250);
  if (entry.session.task.rid) return;
  entry.session.started = true;
  try {
    await entry.session.task._awake?.();
  } catch {}
}

// Shell tasks self-activate once the kernel is up; sessions created
// before boot (e.g. a Home demo mounted while the kernel cold-boots)
// must wait for readiness rather than fail. Retry connect until the
// kernel root + term device are available.
async function connect(entry) {
  let root = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !entry.disposed) {
    try {
      root = getWanixRoot();
      if (root) break;
    } catch {}
    await sleep(250);
  }
  if (!root || entry.disposed) {
    throw new Error("wanix system is not ready");
  }
  await waitReady(entry);
  await root.waitFor(dataPath(entry.id), 30000);
  const readable = await root.openReadable(dataPath(entry.id));
  const writable = await root.openWritable(dataPath(entry.id));
  entry.reader = readable.getReader();
  entry.writer = writable.getWriter();
  pump(entry);
}

async function pump(entry) {
  try {
    while (!entry.disposed) {
      const { done, value } = await entry.reader.read();
      if (done) break;
      if (value?.length) emit(entry, "data", value);
    }
  } catch {
    // stream torn down by dispose or kernel shutdown
  }
  if (!entry.disposed) {
    emit(entry, "exit", { code: null });
    disposeTerminal(entry.id);
  }
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
    reader: null,
    writer: null,
    disposed: false,
    pending: [],
    listeners: { data: new Set(), exit: new Set() },
  };
  sessions.set(id, entry);
  connect(entry).catch((error) => {
    emit(entry, "exit", { code: null, error: error?.message || String(error) });
    disposeTerminal(id);
  });
  return { ok: true, sessionId: id };
}

function writeTerminal(id, data) {
  const entry = sessions.get(String(id));
  if (!entry?.writer) throw new Error("terminal session is not connected yet");
  entry.writer.write(data);
  return { ok: true };
}

async function resizeTerminal(id, cols, rows, xpixel = 0, ypixel = 0) {
  const entry = sessions.get(String(id));
  if (!entry) throw new Error(`unknown terminal session: ${id}`);
  let root = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !entry.disposed && !root) {
    try {
      root = getWanixRoot();
    } catch {}
    if (!root) await sleep(250);
  }
  if (!root || entry.disposed) throw new Error("wanix system is not ready");
  await waitReady(entry);
  await root.waitFor(winchPath(entry.id), 30000);
  // openWritable, not writeFile: writeFile chmods after writing and the
  // signal FS rejects chmod, silently killing every winch update.
  const stream = await root.openWritable(winchPath(entry.id));
  const writer = stream.getWriter();
  await writer.write(new TextEncoder().encode(`${cols} ${rows} ${xpixel} ${ypixel}\n`));
  await writer.close();
  return { ok: true };
}

function disposeTerminal(id) {
  const entry = sessions.get(String(id));
  if (!entry) return { ok: true };
  entry.disposed = true;
  entry.reader?.cancel?.();
  entry.writer?.close?.();
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

function embedTerminal(anchor, profile) {
  if (!anchor || typeof anchor.appendChild !== "function") {
    throw new Error("terminal.embed requires a DOM element");
  }
  const api = getDockviewApi();
  if (!api) throw new Error("terminal.embed requires a mounted dockview");
  const id = `embed-${++sessionCounter}`;
  let detachOverlay;
  try {
    detachOverlay = attachTerminalSession(id, profile, anchor, api);
  } catch (error) {
    destroyTerminalSession(id);
    throw error;
  }
  return {
    sessionId: id,
    detach: () => {
      detachOverlay();
      destroyTerminalSession(id);
    },
  };
}

export const terminalApi = {
  embed: embedTerminal,
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
