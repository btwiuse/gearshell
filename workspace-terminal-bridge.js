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

import { attachKernelTermStream } from "./kernel-term-stream.mjs";
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
} from "./app-terminal-profiles.js";
import { nextVmMac } from "./workspace-vm-mac.js";

// The standalone VM panel was removed; vm.create is driven by plugins
// (v86) that pass their own assets. These are the host fallback used only
// when a session arrives without an explicit archive/rootfs.
const FALLBACK_VM_BACKEND_URL =
  "https://no-cors.up.railway.app/https://github.com/justwasm/wanix/releases/download/v0.4.52/v86.tgz";
const FALLBACK_VM_LINUX_URL =
  "https://no-cors.up.railway.app/https://github.com/justwasm/rv64.js/releases/download/v0.4.28/wanix-linux-x86.tgz";
// Standalone kernel asset (kernel is no longer bundled in the rootfs
// archive). The fallback only ships x86; the rv64 plugin overrides it.
const FALLBACK_VM_KERNEL_URL =
  "https://no-cors.up.railway.app/https://github.com/justwasm/rv64.js/releases/download/v0.4.28/rv64-kernel-x86-minimal";
// Shared per-architecture Wanix overlay: busybox + init + startnet/etc
// + wexec/hostexport + /etc overlay. Binds union-after the rootfs archive.
const FALLBACK_VM_OVERLAY_URL =
  "https://no-cors.up.railway.app/https://github.com/justwasm/rv64.js/releases/download/v0.4.28/wanix-overlay-x86.tgz";

// sessionId -> { session|vmSession, kind, stream, source, origin, disposed }
// — kind is "task" (shell session) or "vm". The kernel stream (reader +
// writer + exit poll) is owned by `stream` (see kernel-term-stream.mjs).
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

// The task element self-activates: base.js connectedCallback ->
// _connect -> _activate -> _awake() runs allocate(+start when the task
// has start="") as soon as the kernel is up, for sessions created after
// boot too. _awake() has its own `if (this.rid) return;` guard so a
// direct call from here is idempotent — both paths converge on a
// single allocate(). Wait on the kernel's `ready` promise (avoids
// polling _kernel being assigned) then on the task element's rid. If
// allocate still hasn't run by then (rare: iframe fired create before
// the element's microtask had a chance), invoke _awake() ourselves as
// a deterministic fallback. The legacy 250ms polling saw use only on
// the cold-boot path where the iframe outpaced the connect chain; the
// explicit await here covers both cases without a timer.
async function wakeTask(entry) {
  const task = entry.session.task;
  // If the element is not yet connected (no _kernelHost), let
  // connectedCallback -> _connect start; wait on its microtask.
  const kernelHost = task._kernelHost ||
    task.closest?.("wanix-system, wanix-namespace");
  if (kernelHost?._kernelReady) {
    await kernelHost._kernelReady;
  } else if (!task._kernel) {
    // No kernel host found yet (task element not attached) — let the
    // element's own connect chain run via one microtask round-trip
    // then re-evaluate.
    await new Promise((resolve) => queueMicrotask(resolve));
  }
  if (!task.rid && task._kernel && typeof task._awake === "function") {
    entry.session.started = true;
    try {
      await task._awake();
    } catch {
      // task element failed to start; the pump's waitFor will surface it
    }
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

function attachKernelStream(entry) {
  // VM sessions have no kernel exit file (their "exit" is whatever the
  // guest does, and the host never writes to a task-shaped exit path for
  // a vm-panel). Skip the exit poller for them; the stream-end event
  // still drives cleanupSession via onStreamEnd.
  const pollExit = entry.kind === "vm"
    ? null
    : (trimmed) => {
      push(entry.source, entry.origin, "term.exit", {
        sessionId: entry.sessionId,
        code: trimmed,
      });
      cleanupSession(entry, { code: trimmed });
    };
  return attachKernelTermStream({
    paths: {
      data: () => dataPath(entry),
      winch: () => winchPath(entry),
      exit: () => exitPath(entry.sessionId),
    },
    beforeConnect: () => whenReady(entry),
    onChunk: (data) => {
      push(entry.source, entry.origin, "term.data", {
        sessionId: entry.sessionId,
        data,
      });
    },
    onStreamEnd: () => cleanupSession(entry, { code: null, note: "stream closed" }),
    onConnectError: (error) => failBridgeSession(entry, error),
    pollExit,
  });
}

function cleanupSession(entry, { code = null } = {}) {
  if (entry.disposed) return;
  entry.disposed = true;
  entry.stream?.dispose();
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
    kind: "task",
    stream: null,
    source: event.source,
    origin: event.origin,
    disposed: false,
  };
  sessions.set(sessionId, entry);
  // Reply immediately; the pump connects asynchronously and the first
  // term.data push only arrives once the kernel stream is open. Any
  // connect failure is surfaced via onConnectError -> failBridgeSession.
  reply(event.source, event.origin, { id: id, ok: true, result: { sessionId } });
  entry.stream = attachKernelStream(entry);
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
  const config = buildVmCreateConfig(args[0]);
  const vmSession = createVmSession(`bridge-${sessionId}`, config);
  const entry = {
    sessionId,
    kind: "vm",
    vmSession,
    stream: null,
    source: event.source,
    origin: event.origin,
    disposed: false,
  };
  sessions.set(sessionId, entry);
  reply(event.source, event.origin, { id: id, ok: true, result: { sessionId } });
  startVmSession(vmSession, { renderTerm: false })
    .then(() => {
      entry.stream = attachKernelStream(entry);
    })
    .catch((error) => failBridgeSession(entry, error));
  return sessionId;
}

// The standalone VM panel was removed; vm.create is driven by plugins
// (v86) that pass their own assets. A minimal inline default keeps an
// unparameterized session working without re-introducing host VM config.
function buildVmCreateConfig(rawArgs) {
  const req = (rawArgs && typeof rawArgs === "object") ? rawArgs : {};
  const config = {
    backendUrl: req.backendUrl || FALLBACK_VM_BACKEND_URL,
    linuxUrl: req.linuxUrl || FALLBACK_VM_LINUX_URL,
    kernelUrl: req.kernelUrl || FALLBACK_VM_KERNEL_URL,
    overlayUrl: req.overlayUrl || FALLBACK_VM_OVERLAY_URL,
    memory: req.memory || "512M",
    netdev: req.netdev || "",
    ...req,
  };
  // The vnet gateway assigns IPs by the guest NIC's MAC, so every VM
  // instance needs a unique MAC or concurrent guests collide onto one IP.
  if (config.netdev && !config.netdev.includes("mac=")) {
    config.netdev += ",mac=" + nextVmMac();
  }
  return config;
}

// Surface a non-recoverable session failure to the iframe and tear the
// session down. Used by both the shell-session create path and the VM
// create path, so the name is intentionally generic.
function failBridgeSession(entry, error) {
  push(entry.source, entry.origin, "term.exit", {
    sessionId: entry.sessionId,
    code: null,
    error: error?.message || String(error),
  });
  cleanupSession(entry);
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
  if (!entry.stream) {
    return reply(event.source, event.origin, {
      id: id,
      ok: false,
      error: "terminal session is not connected yet",
    });
  }
  entry.stream.write(data).catch(() => {
    // kernel stream closed; the pump teardown handles the rest
  });
  reply(event.source, event.origin, { id: id, ok: true });
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
  // whenReady() runs the same wake path the stream attach uses, so the
  // first winch frame cannot be lost to a race with allocate/start.
  whenReady(entry)
    .then(() => entry.stream?.writeWinch(cols, rows, xpixel, ypixel))
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
