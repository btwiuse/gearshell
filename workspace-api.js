// workspace-api.js — GearShell workspace control API (M0, Route A: jsfs).
//
// Exposed to agents as `window.GearShell`. The kernel projects the page's
// globalThis as a filesystem at /js (jsfs, ../wanix web/jsfs), so an agent
// calls a method by writing a JSON-args line to the function file and
// reading the result back on the SAME fd:
//
//   exec 3<>/js/GearShell/<method.path>:json
//   echo '["<args>"]' >&3     # invokes the JS function synchronously
//   read -r out <&3           # returns the JSON result line
//
// This requires hush >= v0.5.9 (sh v3.14.4: fd>2 + `<>` redirections, script
// args) and the wanix kernel >= v0.4.14 (shebang exec, so `gctl` itself can
// run via #!/bin/bash). See ../sh interp/runner.go redirFd and
// ../wanix task.go resolveShebang. The `gctl` bind (GCTL_BIND) wraps that
// protocol into `gctl <method> '<json-args-array>'`.
//
// Only SYNCHRONOUS methods are bridged: jsfs serializes the return value
// with JSON.stringify and never awaits promises (../wanix
// web/jsfs/jsonhelp.go:73), so async work must be fire-and-forget. File
// bytes cannot be returned (kernel 9P calls are async) — agents read and
// write the shared VFS natively with cat/echo instead.
//
// This entry module only assembles the API from the per-domain parts
// (events / open / config / tasks / agents / registry / gctl bind) and
// re-exports the boot hooks; the 500-line rule is enforced across the
// split.

import { workspaceTaskSessions } from "./app-state.js?v=20260826.2";
import { WORKSPACE_TASK_STATUS_EVENT } from "./app-constants.js?v=20260828.20";
import {
  drainEvents,
  emit,
  eventBuffer,
  off,
  on,
  pushEvent,
  seedEventBuffer,
  wirePanelEvents,
} from "./workspace-events.js?v=20260828.4";
import { openApi } from "./workspace-open-api.js?v=20260828.35";
import { configApi } from "./workspace-config-api.js?v=20260828.35";
import {
  runHeadlessTask,
  tasksApi,
} from "./workspace-tasks-api.js?v=20260828.35";
import { agentsApi } from "./workspace-agents-api.js?v=20260828.1";
import { musicApi } from "./music-engine.js?v=20260829.3";
import {
  gcWorkspaceTasks,
  markAgentTaskStatus,
} from "./workspace-task-registry.js?v=20260828.35";
import { ensureGearShellBinds, GCTL_BIND } from "./gctl-bind.js?v=20260828.35";

// --- Sync-only wrapper ---
// The jsfs funcfile surfaces a thrown error as a failed read with no
// message, so every bridged method catches and returns { ok, ... }.
function safe(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };
}

function wrapNamespace(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === "function" ? safe(value) : value;
  }
  return out;
}

// --- API surface (all synchronous) ---
const api = {
  version: "0.1.0",
  ping: safe(() => "pong"),

  config: wrapNamespace(configApi),
  panels: wrapNamespace(openApi.panels),
  browser: wrapNamespace(openApi.browser),
  files: wrapNamespace(openApi.files),
  tasks: wrapNamespace(tasksApi),
  agents: wrapNamespace(agentsApi),
  music: wrapNamespace(musicApi),

  events: {
    on: safe(on),
    off: safe(off),
    emit: safe(emit),
    // Agent-side read of the event ring buffer (see pushEvent above).
    // drainEvents splices the in-memory buffer and advances the
    // persisted drained high-water mark, so events survive reloads
    // without being delivered twice (A2).
    drain: safe(() => {
      const events = drainEvents();
      return { ok: true, events };
    }),
    pending: safe(() => ({ ok: true, count: eventBuffer.length })),
  },
};

// Expose window.GearShell — the jsfs projection target for agents and the
// same-page JS surface. Called from app.js's wiring section.
export function initWorkspaceApi() {
  // Restore persisted events before the api is exposed to agents so a
  // reloaded page starts with any events the agent missed (A2).
  seedEventBuffer();
  try {
    window.GearShell = api;
  } catch {
    // non-browser environment
  }
  // Permanent task-status listener: mirrors every status into the event
  // ring buffer (agents poll it via events.drain / gctl events.drain) and
  // writes terminal statuses into the agent-task registry so the boot-time
  // GC can prune persisted one-shots. The per-call runHeadlessTask
  // listener below is separate and short-lived.
  window.addEventListener(WORKSPACE_TASK_STATUS_EVENT, (event) => {
    const detail = event.detail || {};
    pushEvent("task.status", detail);
    if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
    const session = workspaceTaskSessions.get(Number(detail.taskId));
    if (session?.taskDefinition) {
      markAgentTaskStatus(session.taskDefinition.id, detail.status);
    }
  });
}

// Direct reference to the api for in-page callers (crush install flow,
// etc.) so they don't have to read window.GearShell at call time. The
// reference is the same object that gets published to the kernel via
// window.GearShell = api, so calls here are identical to calls from
// an agent via gctl.
export const workspaceApi = api;

export {
  api,
  ensureGearShellBinds,
  GCTL_BIND,
  gcWorkspaceTasks,
  runHeadlessTask,
  wirePanelEvents,
};
export default api;
