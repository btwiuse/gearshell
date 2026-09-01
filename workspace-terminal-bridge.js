// workspace-terminal-bridge.js — iframe <-> shell terminal data bridge.
//
// The vscode.Terminal-shaped counterpart of the in-page terminal.embed:
// an iframe plugin CANNOT call terminal.embed (it needs a DOM element
// from the caller's document, and returns a detach function), so iframe
// pages render their own xterm and drive a real kernel terminal session
// through these async data methods:
//
//   terminal.create(profile?)  -> { ok, sessionId }
//   terminal.write(id, data)   -> send input bytes (Uint8Array)
//   terminal.resize(id, c, r, xpixel?, ypixel?) -> publish a winch update
//   terminal.dispose(id)       -> kill the session
//   terminal.list()            -> active session ids
//
// Output streams back to the CREATING iframe over the bridge's event
// channel (the same subscribe mechanism plugins-iframe-api.js uses):
//
//   { gear: { event: { topic: "term.data", payload: { sessionId, data } } } }
//   { gear: { event: { topic: "term.exit",  payload: { sessionId, code } } } }
//
// The kernel side is the exact terminal device the shell's own panels
// use: the session task allocates a term resource bound at
// #task/repl-<id>/term with data (readable+writable stream), winch
// (write "cols rows xpixel ypixel") and the task's #task/repl-<id>/exit.
// The pump mirrors wanix elements/term.js: waitFor the data path, open a
// ReadableStream + WritableStream, forward chunks to the iframe. The
// timeout arg to waitFor MUST be an integer literal — a float reaches
// the kernel as a CBOR number and panics it ("arg 1 is not a uint64").

import { permitsPath } from "./plugins-scope.js";
import {
  createHeadlessTerminalSession,
  destroyTerminalSession,
} from "./app-terminal-sessions.js";
import {
  createVmSession,
  destroyVmSession,
  startVmSession,
} from "./app-sessions.js";
import {
  getDefaultTerminalProfile,
  getVmPanelConfig,
} from "./app-terminal-profiles.js";
import { getWanixRoot } from "./app-state.js";

// sessionId -> { session|vmSession, kind, reader, writer, source, origin,
// exitTimer, disposed } — kind is "task" (shell session) or "vm".
const sessions = new Map();

let sessionCounter = 0;

function reply(source, origin, payload) {
  try {
    source.postMessage({ gear: payload }, origin);
  } catch {
    // The iframe is gone; drop the reply.
  }
}

function push(source, origin, topic, payload) {
  reply(source, origin, { event: { topic, payload } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The task element self-activates via the namespace `ready` event when
// created before boot; sessions created after boot need the explicit
// wake (mirrors wakeTerminalSession, minus the wanix-term deref).
// Callers racing the boot (e.g. the iframe's initial winch resize) must
// await the SAME _awake promise, not just a started flag: the term is
// only allocated after _awake resolves, so a resize that skips an
// in-flight _awake writes to a winch path that does not exist yet.
// The task element self-activates: base.js connectedCallback ->
// _connect -> _activate -> _awake() runs allocate(+start when the task
// has start="") as soon as the kernel is up, for sessions created after
// boot too. Calling _awake() from here RACES that: both see rid unset
// and allocate twice, the second _setupNamespace re-reads the
// fetch-bound binaries' streams and the kernel panics ("Response body
// object should not be disturbed or locked") — the intermittent
// "terminal shows nothing" failure. So wait for the element to finish
// allocating; fall back to an explicit wake only if it never does.
async function wakeTask(entry) {
  const task = entry.session.task;
  const deadline = Date.now() + 30000;
  while (!task.rid) {
    if (Date.now() > deadline) {
      entry.session.started = true;
      try {
        await task._awake?.();
      } catch {
        // task element failed to start; the pump's waitFor will surface it
      }
      break;
    }
    await sleep(250);
  }
}

function dataPath(entry) {
  return entry.kind === "vm"
    ? `#vm/vm-panel-${entry.vmSession.id}/term/data`
    : `#task/repl-${entry.sessionId}/term/data`;
}

function winchPath(entry) {
  return entry.kind === "vm"
    ? `#vm/vm-panel-${entry.vmSession.id}/term/winch`
    : `#task/repl-${entry.sessionId}/term/winch`;
}

function exitPath(id) {
  return `#task/repl-${id}/exit`;
}

// Await the session's backing element: shell tasks self-activate (see
// wakeTask), VM sessions resolve when the host kernel spawned the VM.
function whenReady(entry) {
  return entry.kind === "vm"
    ? entry.vmSession.startPromise
    : wakeTask(entry);
}

async function connectStreams(entry) {
  const root = getWanixRoot();
  // Integer literal timeout: floats panic the kernel (see header note).
  await root.waitFor(dataPath(entry), 30000);
  const readable = await root.openReadable(dataPath(entry));
  const writable = await root.openWritable(dataPath(entry));
  entry.reader = readable.getReader();
  entry.writer = writable.getWriter();
  pumpOutput(entry);
  if (entry.kind !== "vm") {
    startExitPolling(entry);
  }
}

// Forward kernel output chunks to the creating iframe. The payload data
// is a Uint8Array — postMessage structured-clones it across the frame
// boundary without a JSON round trip.
async function pumpOutput(entry) {
  try {
    while (!entry.disposed) {
      const { done, value } = await entry.reader.read();
      if (done) break;
      if (value && value.length) {
        push(entry.source, entry.origin, "term.data", {
          sessionId: entry.sessionId,
          data: value,
        });
      }
    }
  } catch {
    // stream closed by dispose or kernel teardown
  }
  if (!entry.disposed) {
    cleanupSession(entry, { code: null, note: "stream closed" });
  }
}

// Poll the task exit file like the shell's own terminals (startReplExit-
// Polling) and surface the code to the iframe once the process is gone.
function startExitPolling(entry) {
  const poll = async () => {
    if (entry.disposed || !sessions.has(entry.sessionId)) return;
    let text;
    try {
      text = await getWanixRoot().readText(exitPath(entry.sessionId));
    } catch {
      return;
    }
    const code = (text || "").trim();
    if (code === "") return;
    push(entry.source, entry.origin, "term.exit", {
      sessionId: entry.sessionId,
      code,
    });
    cleanupSession(entry, { code });
  };
  poll();
  entry.exitTimer = setInterval(poll, 500);
}

function cleanupSession(entry, { code = null } = {}) {
  if (entry.disposed) return;
  entry.disposed = true;
  if (entry.exitTimer) clearInterval(entry.exitTimer);
  try {
    entry.reader?.cancel?.();
  } catch {
    // already closed
  }
  try {
    entry.writer?.close?.();
  } catch {
    // already closed
  }
  try {
    if (entry.kind === "vm") {
      destroyVmSession(entry.vmSession.id);
    } else {
      destroyTerminalSession(entry.sessionId);
    }
  } catch {
    // session already gone
  }
  sessions.delete(entry.sessionId);
}

function sessionArgs(args, index) {
  return Array.isArray(args) ? args[index] : undefined;
}

function handleCreate(event, id, args) {
  const sessionId = `bridge-${++sessionCounter}`;
  const profileArg = sessionArgs(args, 0);
  const profile = {
    ...getDefaultTerminalProfile(),
    ...(profileArg && typeof profileArg === "object" ? profileArg : {}),
  };
  const session = createHeadlessTerminalSession(sessionId, profile);
  const entry = {
    sessionId,
    session,
    reader: null,
    writer: null,
    source: event.source,
    origin: event.origin,
    exitTimer: null,
    disposed: false,
  };
  sessions.set(sessionId, entry);
  // Reply immediately; the pump connects asynchronously and the first
  // term.data push only arrives once the kernel stream is open.
  reply(event.source, event.origin, { id: id, ok: true, result: { sessionId } });
  wakeTask(entry)
    .then(() => connectStreams(entry))
    .catch((error) => {
      push(entry.source, entry.origin, "term.exit", {
        sessionId,
        code: null,
        error: error?.message || String(error),
      });
      cleanupSession(entry);
    });
  return sessionId;
}

// Spawn a VM in the HOST wanix kernel (the same instance the shell and
// panels use — no second kernel per plugin) and bridge its term device
// to the creating iframe. The plugin renders its own xterm; the host VM
// session renders no wanix-term (renderTerm: false). Input and winch
// ride the same term device as shell sessions, so the plugin drives
// them with terminal.write / terminal.resize.
function handleVmCreate(event, id, args) {
  const sessionId = `bridge-vm-${++sessionCounter}`;
  const config = {
    ...getVmPanelConfig(),
    ...(args[0] && typeof args[0] === "object" ? args[0] : {}),
  };
  const vmSession = createVmSession(`bridge-${sessionId}`, config);
  const entry = {
    sessionId,
    kind: "vm",
    vmSession,
    reader: null,
    writer: null,
    source: event.source,
    origin: event.origin,
    exitTimer: null,
    disposed: false,
  };
  sessions.set(sessionId, entry);
  reply(event.source, event.origin, { id: id, ok: true, result: { sessionId } });
  startVmSession(vmSession, { renderTerm: false })
    .then(() => connectStreams(entry))
    .catch((error) => {
      push(entry.source, entry.origin, "term.exit", {
        sessionId,
        code: null,
        error: error?.message || String(error),
      });
      cleanupSession(entry);
    });
  return sessionId;
}

function handleWrite(event, id, args) {
  const sessionId = String(sessionArgs(args, 0) ?? "");
  const entry = sessions.get(sessionId);
  if (!entry) {
    return reply(event.source, event.origin, {
      id: id,
      ok: false,
      error: `unknown terminal session: ${sessionId}`,
    });
  }
  const data = sessionArgs(args, 1);
  if (!(data instanceof Uint8Array)) {
    return reply(event.source, event.origin, {
      id: id,
      ok: false,
      error: "terminal.write requires a Uint8Array payload",
    });
  }
  if (!entry.writer) {
    return reply(event.source, event.origin, {
      id: id,
      ok: false,
      error: "terminal session is not connected yet",
    });
  }
  entry.writer.write(data).catch(() => {
    // kernel stream closed; the pump teardown handles the rest
  });
  reply(event.source, event.origin, { id: id, ok: true });
}

// The term device's winch path is a signal broadcaster whose reader
// blocks until the first frame, so the very first winch write must land
// or apps (cat /winch, bubbletea-style TERM_WINCH readers) hang forever.
function writeWinch(root, entry, cols, rows, xpixel, ypixel) {
  // openWritable, not writeFile: the root writeFile helper chmods after
  // writing and the signal FS rejects chmod, silently killing every winch
  // update (the shell's own terminals use openWritable for the same
  // reason — elements/term.js).
  return root
    .openWritable(winchPath(entry))
    .then((stream) => {
      const writer = stream.getWriter();
      return writer
        .write(new TextEncoder().encode(`${cols} ${rows} ${xpixel} ${ypixel}\n`))
        .then(() => writer.close());
    });
}

function handleResize(event, id, args) {
  const sessionId = String(sessionArgs(args, 0) ?? "");
  const entry = sessions.get(sessionId);
  if (!entry) {
    return reply(event.source, event.origin, {
      id: id,
      ok: false,
      error: `unknown terminal session: ${sessionId}`,
    });
  }
  const cols = Number(sessionArgs(args, 1)) || 0;
  const rows = Number(sessionArgs(args, 2)) || 0;
  const xpixel = Number(sessionArgs(args, 3)) || 0;
  const ypixel = Number(sessionArgs(args, 4)) || 0;
  // The iframe resizes right after create(), which races kernel boot;
  // wait for readiness AND the term device itself (the winch path only
  // exists once the VM element finished allocating its term) so the
  // initial winch frame cannot be lost.
  whenReady(entry)
    .then(() => getWanixRoot().waitFor(winchPath(entry), 30000))
    .then(() => writeWinch(getWanixRoot(), entry, cols, rows, xpixel, ypixel))
    .then(() => reply(event.source, event.origin, { id: id, ok: true }))
    .catch((error) =>
      reply(event.source, event.origin, {
        id: id,
        ok: false,
        error: error?.message || String(error),
      })
    );
}

function handleDispose(event, id, args) {
  const sessionId = String(sessionArgs(args, 0) ?? "");
  const entry = sessions.get(sessionId);
  if (entry) cleanupSession(entry);
  reply(event.source, event.origin, { id: id, ok: true });
}

function handleList(event, id) {
  reply(event.source, event.origin, {
    id: id,
    ok: true,
    result: { sessions: [...sessions.keys()] },
  });
}

// Entry point from plugins-iframe-api.js: vm.* methods create a VM in the
// host kernel and return a sessionId driven through the terminal.* methods
// (same session table). Permission check mirrors the generic path.
export function dispatchVmCall(event, gear, plugin) {
  const { id, method, args } = gear;
  try {
    const allow = plugin.manifest?.permissions?.api || [];
    if (!permitsPath(allow, method)) {
      return reply(event.source, event.origin, {
        id,
        ok: false,
        error: `permission denied: ${method}`,
      });
    }
    const name = method.slice("vm.".length);
    switch (name) {
      case "create":
        return handleVmCreate(event, id, args);
      case "list":
        return handleList(event, id);
      default:
        return reply(event.source, event.origin, {
          id,
          ok: false,
          error: `unknown vm method: ${name}`,
        });
    }
  } catch (error) {
    console.error("vm bridge error:", error);
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: error?.message || String(error),
    });
  }
}

// Entry point from plugins-iframe-api.js: terminal.* methods are routed
// here (they need the event context for pushes and are iframe-only by
// design). Permission check mirrors the generic path (permitsPath).
export function dispatchTerminalCall(event, gear, plugin) {
  const { id, method, args } = gear;
  try {
    const allow = plugin.manifest?.permissions?.api || [];
    if (!permitsPath(allow, method)) {
      return reply(event.source, event.origin, {
        id,
        ok: false,
        error: `permission denied: ${method}`,
      });
    }
    const name = method.slice("terminal.".length);
    switch (name) {
      case "create":
        return handleCreate(event, id, args);
      case "write":
        return handleWrite(event, id, args);
      case "resize":
        return handleResize(event, id, args);
      case "dispose":
        return handleDispose(event, id, args);
      case "list":
        return handleList(event, id);
      default:
        return reply(event.source, event.origin, {
          id,
          ok: false,
          error: `unknown terminal method: ${name}`,
        });
    }
  } catch (error) {
    // Never leave the iframe hanging: surface the failure as a reply.
    console.error("terminal bridge error:", error);
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: error?.message || String(error),
    });
  }
}
