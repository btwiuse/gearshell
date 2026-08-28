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

import { getDockviewApi } from "./app-panels-store.js?v=20260826.7";
import {
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import {
  addWorkspaceTask,
  loadActiveWorkspace,
  loadConfig,
  saveConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.7";
import {
  addPanelByComponent,
  addWorkspaceTaskPanel,
} from "./panels.js?v=20260812.37";
import {
  destroyWorkspaceTaskSession,
  getTaskOutput,
  taskLogKernelPath,
} from "./app-workspace-task-sessions.js?v=20260828.11";

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

// --- Event pub/sub (in-memory + window CustomEvent mirror) ---
const listeners = new Map();

function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => off(topic, fn);
}

function off(topic, fn) {
  listeners.get(topic)?.delete(fn);
}

function emit(topic, payload) {
  for (const fn of [...(listeners.get(topic) || [])]) {
    try {
      fn(payload);
    } catch {
      // keep dispatching to the rest
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent(`gear-shell:${topic}`, { detail: payload }),
    );
  } catch {
    // non-browser environment
  }
  return { ok: true };
}

// --- API surface (all synchronous) ---
const api = {
  version: "0.1.0",
  ping: safe(() => "pong"),

  config: wrapNamespace({
    getShell: () => loadConfig(),
    updateShell: (patch) => {
      saveConfig({ ...loadConfig(), ...patch });
      return loadConfig();
    },
    getWorkspace: () => loadActiveWorkspace(),
    getBinds: () => loadActiveWorkspace().system.binds,
    addBind: (bind) => {
      const workspace = loadActiveWorkspace();
      workspace.system.binds.push(bind);
      saveWorkspace(workspace);
      updateWorkspaceIndex(workspace);
      return workspace.system.binds;
    },
  }),

  panels: wrapNamespace({
    list: () =>
      (getDockviewApi()?.panels ?? []).map((panel) => ({
        id: panel.id,
        // dockview's panel.component is the component reference, not the
        // registered name; the name lives in params.panelType (set by every
        // panel adder), with the id prefix as a fallback.
        component: typeof panel.params?.panelType === "string"
          ? panel.params.panelType
          : panel.id.replace(/-\d+$/, ""),
        title: panel.title,
        isActive: panel.api.isActive,
      })),
    open: (component, options) => {
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      addPanelByComponent(dockview, component, undefined, options);
      return { ok: true };
    },
    close: (id) => {
      getDockviewApi()?.getPanel(id)?.api.close();
      return { ok: true };
    },
    focus: (id) => {
      getDockviewApi()?.getPanel(id)?.api.setActive();
      return { ok: true };
    },
  }),

  tasks: wrapNamespace({
    list: () =>
      [...workspaceTaskSessions.values()].map((session) => ({
        id: session.id,
        cmd: session.taskDefinition?.cmd ?? null,
        status: session.status || "created",
        panelId: `workspace-task-${session.id}`,
      })),
    create: (spec) => {
      const workspace = loadActiveWorkspace();
      const stored = addWorkspaceTask(spec);
      // Open the panel with the NORMALIZED task (addWorkspaceTask fills
      // env/wd/type/term defaults): the panel session reads
      // taskDefinition.env.trim() and would crash on a raw spec.
      const tasks = stored?.tasks ?? [];
      const normalized = tasks.length > 0 ? tasks[tasks.length - 1] : spec;
      const panel = addWorkspaceTaskPanel(
        getDockviewApi(),
        normalized,
        workspace,
      );
      return {
        ok: true,
        panelId: panel?.id ?? null,
        taskId: tasks.length > 0 ? tasks[tasks.length - 1].id : null,
      };
    },
    cancel: (id) => {
      destroyWorkspaceTaskSession(id);
      getDockviewApi()?.getPanel(`workspace-task-${id}`)?.api.close();
      return { ok: true };
    },
    output: (id) => {
      const session = workspaceTaskSessions.get(Number(id));
      if (!session) return { ok: false, error: "task not found" };
      if (session.term) {
        return { ok: false, error: "task has a terminal; read its panel" };
      }
      return {
        ok: true,
        taskId: id,
        path: `/${taskLogKernelPath(session)}`,
        output: getTaskOutput(Number(id)),
      };
    },
  }),

  agents: wrapNamespace({
    // Session ids are prefixed so terminal and workspace-task counters
    // (both start at 1) can never collide.
    list: () => {
      const out = [];
      for (const session of terminalSessions.values()) {
        out.push({
          id: `terminal-${session.id}`,
          kind: "terminal",
          profile: session.profile?.name ?? null,
          status: session.status || "created",
        });
      }
      for (const session of workspaceTaskSessions.values()) {
        out.push({
          id: `task-${session.id}`,
          kind: "task",
          profile: session.taskDefinition?.cmd ?? null,
          status: session.status || "created",
        });
      }
      return out;
    },
    prompt: (id, text) => {
      const session = resolveSession(id);
      if (!session?.term?._term) {
        return { ok: false, error: "session has no live terminal" };
      }
      session.term._term.input(String(text) + "\r");
      return { ok: true };
    },
    interrupt: (id) => {
      const session = resolveSession(id);
      if (!session?.term?._term) {
        return { ok: false, error: "session has no live terminal" };
      }
      session.term._term.input("\u0003");
      return { ok: true };
    },
  }),

  events: { on: safe(on), off: safe(off), emit: safe(emit) },
};

function resolveSession(id) {
  if (typeof id === "string" && id.startsWith("task-")) {
    return workspaceTaskSessions.get(Number(id.slice(5)));
  }
  if (typeof id === "string" && id.startsWith("terminal-")) {
    return terminalSessions.get(Number(id.slice("terminal-".length)));
  }
  return terminalSessions.get(id);
}

// --- The jsfs projection of the API lives at /js/GearShell (kernel
// jsfs roots at globalThis; window.GearShell = api makes the methods
// reachable). The js bind is already part of DEFAULT_SYSTEM_CONFIG; the
// gctl helper below wraps the protocol for shells. ---

// The gctl CLI (Route A). Requires hush >= v0.5.8 for fd>2 + `<>`
// redirections; uses only POSIX constructs plus read/printf builtins, so it
// also runs under any POSIX-ish shell. Args are a JSON array of parameters.
export const GCTL_BIND = {
  id: "gctl",
  type: "file",
  dst: "bin/gctl",
  mode: "0755",
  content: [
    "#!/bin/bash",
    "# gctl: GearShell workspace control (jsfs fd bridge).",
    "# usage: gctl <method.dotted.path> [json-args-array]",
    "set -u",
    'if [ "$#" -lt 1 ]; then',
    '  echo "usage: gctl <method.dotted.path> [json-args-array]" >&2',
    "  exit 2",
    "fi",
    'method="$1"',
    'args="${2:-[]}"',
    '# dotted method -> jsfs path segments. mvdan.cc/sh joins "$*" with',
    "# IFS only when it is the sole content of a quoted string (assignment",
    '# and embedded contexts space-join), so build the path with a "$@" loop.',
    '_ifs="$IFS"',
    "IFS=.",
    "set -- $method",
    'IFS="$_ifs"',
    'path="/js/GearShell"',
    'for _seg in "$@"; do',
    '  path="$path/$_seg"',
    "done",
    "# jsfs synthetic view suffixes use ':' (:json), not '.json' — a dot",
    "# would be treated as part of the object key and silently create a",
    "# bogus property on GearShell (web/jsfs helpers.go parseSuffixSegment).",
    'path="$path:json"',
    'exec 3<>"$path" 2>/dev/null || { echo "gctl: cannot open $path" >&2; exit 1; }',
    'echo "$args" >&3 || { echo "gctl: call failed" >&2; exit 1; }',
    "# mvdan.cc/sh's read builtin exits 1 when the line has no trailing",
    "# newline (the jsfs funcfile result is newline-less), so gate on the",
    "# variable instead of the exit status. A failed invoke (e.g. args not",
    "# a JSON array) surfaces here as an empty read.",
    'read -r out <&3 || [ -n "${out:-}" ] || { echo "gctl: no response (args must be a JSON array)" >&2; exit 1; }',
    "exec 3<&-",
    'printf "%s\\n" "$out"',
    "",
  ].join("\n"),
};

// --- Boot hooks ---
// Ensure the active workspace carries the /js projection bind (needed for
// the gctl protocol; normally part of DEFAULT_SYSTEM_CONFIG) and the gctl
// CLI. Must run BEFORE the wanix namespace is built (app.js calls this
// right after loadActiveWorkspace()), because binds are baked into the
// namespace at construction. Idempotent by bind dst; the gctl CLI content
// is REFRESHED when the protocol changes (e.g. the jsfs `:json` suffix),
// so saved workspaces pick up fixes without manual edits.
export function ensureGearShellBinds(workspace) {
  if (!workspace?.system) return;
  let changed = false;
  if (!workspace.system.binds.some((item) => item.dst === "js")) {
    workspace.system.binds.push({
      id: "js",
      type: "ns",
      dst: "js",
      src: "#js",
    });
    changed = true;
  }
  const gctlIndex = workspace.system.binds.findIndex(
    (item) => item.dst === "bin/gctl",
  );
  if (gctlIndex === -1) {
    workspace.system.binds.push({ ...GCTL_BIND });
    changed = true;
  } else if (workspace.system.binds[gctlIndex].content !== GCTL_BIND.content) {
    workspace.system.binds[gctlIndex] = { ...GCTL_BIND };
    changed = true;
  }
  if (!changed) return;
  try {
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  } catch {
    // workspace store may be mid-migration; in-place mutation still covers
    // this session's namespace build
  }
}

// Expose window.GearShell — the jsfs projection target for agents and the
// same-page JS surface. Called from app.js's wiring section.
export function initWorkspaceApi() {
  try {
    window.GearShell = api;
  } catch {
    // non-browser environment
  }
}

export { api };
export default api;
