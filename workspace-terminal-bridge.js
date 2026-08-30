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
import { getDefaultTerminalProfile } from "./app-terminal-profiles.js";
import { getWanixRoot, systemReady } from "./app-state.js";

// sessionId -> { session, reader, writer, source, origin, exitTimer }
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
async function wakeTask(entry) {
  while (!systemReady) await sleep(250);
  if (!entry.session.started) {
    entry.session.started = true;
    try {
      await entry.session.task._awake?.();
    } catch {
      // task element failed to start; the pump's waitFor will surface it
    }
  }
}

function dataPath(id) {
  return `#task/repl-${id}/term/data`;
}

function winchPath(id) {
  return `#task/repl-${id}/term/winch`;
}

function exitPath(id) {
  return `#task/repl-${id}/exit`;
}

async function connectStreams(entry) {
  const root = getWanixRoot();
  // Integer literal timeout: floats panic the kernel (see header note).
  await root.waitFor(dataPath(entry.sessionId), 30000);
  const readable = await root.openReadable(dataPath(entry.sessionId));
  const writable = await root.openWritable(dataPath(entry.sessionId));
  entry.reader = readable.getReader();
  entry.writer = writable.getWriter();
  pumpOutput(entry);
  startExitPolling(entry);
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
    destroyTerminalSession(entry.sessionId);
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
function writeWinch(root, sessionId, cols, rows, xpixel, ypixel) {
  // openWritable, not writeFile: the root writeFile helper chmods after
  // writing and the signal FS rejects chmod, silently killing every winch
  // update (the shell's own terminals use openWritable for the same
  // reason — elements/term.js).
  return root
    .openWritable(winchPath(sessionId))
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
  // wait for readiness so the initial winch frame cannot be lost.
  wakeTask(entry)
    .then(() => writeWinch(getWanixRoot(), sessionId, cols, rows, xpixel, ypixel))
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
