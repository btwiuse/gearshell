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

import { getDockviewApi } from "./app-panels-store.js?v=20260826.16";
import {
  getWanixRoot,
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
} from "./app-workspace.js?v=20260826.16";
import {
  addIframePanel,
  addPanelByComponent,
  addWorkspaceTaskPanel,
} from "./panels.js?v=20260812.39";
import {
  destroyWorkspaceTaskSession,
  getTaskOutput,
  taskLogKernelPath,
} from "./app-workspace-task-sessions.js?v=20260828.22";
import { WORKSPACE_TASK_STATUS_EVENT } from "./app-constants.js?v=20260828.9";
import { requestFilesOpen } from "./files.js?v=20260826.52";
import {
  normalizeTask,
  validateTask,
} from "./app-normalize-system.js?v=20260828.1";

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

// Resolve { group, referencePanel, direction } into the group id a new
// panel lands in. direction alone docks to the container edge; group /
// referencePanel split next to that group or panel (dockview addGroup
// options, verified against the v8.2.0 source); neither keeps the
// caller's default (active group).
function groupFor(dockview, options) {
  if (!options?.direction) return options?.group;
  const reference = options.referencePanel
    ? { referencePanel: options.referencePanel }
    : options.group
    ? { referenceGroup: options.group }
    : {};
  return dockview.addGroup({
    ...reference,
    direction: options.direction,
  }).id;
}

// --- Event pub/sub (in-memory + window CustomEvent mirror) ---
const listeners = new Map();

// Bounded ring buffer so AGENTS can read page events: the jsfs bridge is
// synchronous and functions do not survive JSON serialization, so a
// callback-based subscribe cannot cross the boundary. Agents poll
// events.drain (or `gctl events.drain`) at the same 800ms rhythm used
// for tasks.output and get everything buffered since the last drain.
const eventBuffer = [];
const EVENT_BUFFER_LIMIT = 200;

function pushEvent(topic, payload) {
  eventBuffer.push({ topic, payload: payload ?? null, ts: Date.now() });
  if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
    eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
  }
}

function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => off(topic, fn);
}

function off(topic, fn) {
  listeners.get(topic)?.delete(fn);
}

function emit(topic, payload) {
  pushEvent(topic, payload);
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
      const result = loadConfig();
      pushEvent("config.changed", { result });
      return result;
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
        groupId: panel.api.group?.id ?? null,
      })),
    open: (component, options) => {
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      addPanelByComponent(dockview, component, options?.group, options);
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

  browser: wrapNamespace({
    open: (url, options = {}) => {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
        return { ok: false, error: "a http(s):// URL is required" };
      }
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      const target = url.trim();
      addIframePanel(dockview, {
        title: target,
        src: target,
        panelType: "browser",
        allow: "clipboard-read; clipboard-write; fullscreen",
        allowFullscreen: true,
      }, groupFor(dockview, options));
      // No window.open here: agent calls carry no user gesture, so popups
      // are always blocked. The wrapper's popout button (user click) is
      // the way to a real browser tab.
      return { ok: true, url: target };
    },
  }),

  files: wrapNamespace({
    open: (path, options = {}) => {
      if (typeof path !== "string" || !path.trim()) {
        return { ok: false, error: "path required" };
      }
      const dockview = getDockviewApi();
      if (!dockview) return { ok: false, error: "dockview not ready" };
      const target = path.trim();
      const existing = dockview.panels.find(
        (panel) => panel.params?.panelType === "files",
      );
      if (existing) existing.api.setActive();
      else addPanelByComponent(dockview, "files", groupFor(dockview, options));
      const { queued } = requestFilesOpen(target);
      return { ok: true, path: target, queued };
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
    create: (spec, options = {}) => {
      const workspace = loadActiveWorkspace();
      // background = pure headless task with no panel and no workspace
      // persistence: normalize+validate directly, open the session
      // via addWorkspaceTaskPanel's background branch, and return the
      // task id for status-event subscription. Used by one-shot probes
      // (type -a) and installs where a visible tab would be noise.
      if (options.background === true) {
        const normalized = normalizeTask(spec);
        const error = validateTask(normalized);
        if (error) return { ok: false, error };
        const opened = addWorkspaceTaskPanel(
          getDockviewApi(),
          normalized,
          workspace,
          { background: true },
        );
        return {
          ok: true,
          panelId: null,
          taskId: opened?.sessionId ?? null,
          background: true,
        };
      }
      // Ephemeral by default: agent tasks are one-shots, so they must not
      // survive a reload. Restored task panels respawn their workers, and
      // a few rounds of test tasks used to pile up zombies that eventually
      // wedged the kernel. persist: true opts back into the old behavior
      // (definition saved to the workspace + panel remembered for tab
      // restore, then GC'd once it reaches a terminal status).
      if (options.persist !== true) {
        const normalized = normalizeTask(spec);
        const error = validateTask(normalized);
        if (error) return { ok: false, error };
        const panel = addWorkspaceTaskPanel(
          getDockviewApi(),
          normalized,
          workspace,
          {
            silent: options.silent === true,
            group: groupFor(getDockviewApi(), options),
            persist: false,
          },
        );
        return {
          ok: true,
          panelId: panel?.id ?? null,
          taskId: normalized.id,
          ephemeral: true,
          autoClose: options.autoClose === true,
        };
      }
      const stored = addWorkspaceTask(spec);
      // Open the panel with the NORMALIZED task (addWorkspaceTask fills
      // env/wd/type/term defaults): the panel session reads
      // taskDefinition.env.trim() and would crash on a raw spec.
      const tasks = stored?.tasks ?? [];
      const normalized = tasks.length > 0 ? tasks[tasks.length - 1] : spec;
      // Track the persisted definition in the agent-task registry so the
      // boot-time GC prunes it once it reaches a terminal status.
      if (normalized) markAgentTask(normalized.id);
      const panel = addWorkspaceTaskPanel(
        getDockviewApi(),
        normalized,
        workspace,
        {
          silent: options.silent === true,
          group: groupFor(getDockviewApi(), options),
        },
      );
      // autoClose: when the task reaches the terminal status event, close
      // its own panel. Implemented by the caller (not here) so the install
      // flow can also react to the status (re-detect, update banner).
      return {
        ok: true,
        panelId: panel?.id ?? null,
        taskId: tasks.length > 0 ? tasks[tasks.length - 1].id : null,
        autoClose: options.autoClose === true,
      };
    },
    cancel: (id) => {
      // Persisted agent-managed definitions get a terminal status so the
      // boot-time GC prunes them; ephemeral tasks are never stored.
      const session = workspaceTaskSessions.get(Number(id));
      if (session?.taskDefinition) {
        markAgentTaskStatus(session.taskDefinition.id, "cancelled");
      }
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
    prompt: (id, text, options = {}) => {
      const session = resolveSession(id);
      const term = session?.term?._term;
      if (!term) {
        return { ok: false, error: "session has no live terminal" };
      }
      ensureTermActivityTracking(session);
      // Idle gate: never inject while output is still landing, so a prompt
      // cannot interleave with a running command — and an agent cannot
      // spin, re-injecting into the tail of its own last command. The
      // caller (agent) is expected to retry after retryAfterMs.
      const idleMs = Date.now() - session._termOutputAt;
      if (idleMs < PROMPT_IDLE_MS) {
        return {
          ok: false,
          error: `terminal busy (last output ${idleMs}ms ago)`,
          busy: true,
          retryAfterMs: PROMPT_IDLE_MS - idleMs,
        };
      }
      // Human-collision gate: refuse to inject into a terminal a human
      // typed in recently (an agent loop hijacking a live human session
      // was a demonstrated failure mode). force: true overrides for
      // explicit drive flows.
      if (
        options.force !== true &&
        Date.now() - session._termHumanInputAt < HUMAN_INPUT_GRACE_MS
      ) {
        return {
          ok: false,
          error: "session has recent human input",
          humanActive: true,
        };
      }
      enqueuePrompt(session, String(text) + "\r");
      return { ok: true };
    },
    // Read the session terminal's scrollback as plain text (xterm buffer
    // cells via translateToString, so no escape sequences — those were
    // consumed by xterm's parser). Snapshot semantics: what is currently
    // on screen / in the bounded scrollback, capped to the last `rows`
    // lines. For lossless full transcripts use a headless task +
    // tasks.output instead.
    read: (id, options = {}) => {
      const session = resolveSession(id);
      const term = session?.term?._term;
      if (!term) {
        return { ok: false, error: "session has no live terminal" };
      }
      const buffer = term.buffer?.active;
      if (!buffer) {
        return { ok: false, error: "terminal buffer not available" };
      }
      const rows = Math.max(1, Math.min(Number(options?.rows) || 100, 2000));
      const start = Math.max(0, buffer.length - rows);
      const lines = [];
      for (let y = start; y < buffer.length; y++) {
        const line = buffer.getLine(y);
        lines.push(line ? line.translateToString(true) : "");
      }
      return {
        ok: true,
        id,
        rows: lines.length,
        lines,
        text: lines.join("\n"),
      };
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

  events: {
    on: safe(on),
    off: safe(off),
    emit: safe(emit),
    // Agent-side read of the event ring buffer (see pushEvent above).
    drain: safe(() => {
      const events = eventBuffer.splice(0, eventBuffer.length);
      return { ok: true, events };
    }),
    pending: safe(() => ({ ok: true, count: eventBuffer.length })),
  },
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

// --- Terminal activity tracking + prompt delivery ---
// agents.prompt must not interleave with running output or hijack a
// terminal a human is using. Both gates rely on xterm events attached
// lazily (one-time) to the session's terminal:
//   - onWriteParsed fires when output lands in the buffer -> last output.
//   - onKey fires for REAL keyboard input only (programmatic input()
//     goes through onData, not onKey) -> last human keystroke.
// Tracked on the session object so it survives alongside the session.
const PROMPT_IDLE_MS = 1200;
const HUMAN_INPUT_GRACE_MS = 5000;
const PROMPT_DELIVERY_GAP_MS = 60;

function ensureTermActivityTracking(session) {
  const term = session.term?._term;
  if (!term) return;
  // The wanix-term element recreates its xterm when a panel re-attaches,
  // orphaning listeners attached to the previous instance. Key on the
  // xterm identity, not a one-time flag, so tracking re-binds after the
  // swap instead of silently going dead.
  if (session._termTrackingXterm === term) return;
  session._termTrackingXterm = term;
  if (session._termOutputAt == null) session._termOutputAt = 0;
  if (session._termHumanInputAt == null) session._termHumanInputAt = 0;
  term.onWriteParsed?.(() => {
    session._termOutputAt = Date.now();
  });
  term.onKey?.(() => {
    session._termHumanInputAt = Date.now();
  });
}

// Serialize prompt delivery per session: xterm's input() is unreliable
// under rapid-fire writes, so each prompt waits for the previous one to
// settle (PROMPT_DELIVERY_GAP_MS) before being injected. The API stays
// synchronous (fire-and-forget); ordering is what the agent needs.
function enqueuePrompt(session, textWithReturn) {
  const chain = session._promptChain || Promise.resolve();
  session._promptChain = chain
    .then(
      () =>
        new Promise((resolve) => {
          try {
            session.term?._term?.input(textWithReturn);
          } catch {
            // terminal gone; drop this delivery
          }
          setTimeout(resolve, PROMPT_DELIVERY_GAP_MS);
        }),
    )
    .catch(() => {});
  return session._promptChain;
}

// --- The jsfs projection of the API lives at /js/GearShell (kernel
// jsfs roots at globalThis; window.GearShell = api makes the methods
// reachable). The js bind is already part of DEFAULT_SYSTEM_CONFIG; the
// gctl helper below wraps the protocol for shells. ---

// The gctl CLI (Route A). Requires hush >= v0.5.8 for fd>2 + `<>`
// redirections. Uses modern bash syntax ([[ ]], parameter expansion) —
// hush runs scripts with a #!/bin/bash shebang in bash language mode.
// Args are a JSON array of parameters.
export const GCTL_BIND = {
  id: "gctl",
  type: "file",
  dst: "bin/gctl",
  mode: "0755",
  content: [
    "#!/bin/bash",
    "# gctl: GearShell workspace control (jsfs fd bridge).",
    "# usage: gctl <method.dotted.path> [json-args-array]",
    "# Bashisms ([[ ]], parameter expansion) are fine: hush runs scripts",
    "# with a #!/bin/bash shebang in bash language mode.",
    "set -u",
    "if [[ $# -lt 1 ]]; then",
    '  echo "usage: gctl <method.dotted.path> [json-args-array]" >&2',
    "  exit 2",
    "fi",
    'method="$1"',
    'args="${2:-[]}"',
    "# `gctl open <file|url>`: http(s) URLs open a browser iframe panel;",
    "# anything else is resolved against $PWD (the task ns) and opened as",
    "# a file in the file browser with a preview.",
    "if [[ $method == open ]]; then",
    '  _target="$args"',
    '  [[ -n $_target ]] || { echo "usage: gctl open <file|url>" >&2; exit 2; }',
    "  if [[ $_target == http://* || $_target == https://* ]]; then",
    "    method=browser.open",
    '    args="[\\"$_target\\"]"',
    "  else",
    "    if [[ $_target == /* ]]; then",
    "      :",
    "    else",
    '      _dir="${_target%/*}"; _name="${_target##*/}"',
    '      [[ $_dir == "$_target" ]] && _dir=.',
    '      _dir="$(cd "$_dir" 2>/dev/null && pwd -P)" || _dir=""',
    '      _target="${_dir:+$_dir/}$_name"',
    "    fi",
    "    method=files.open",
    '    args="[\\"$_target\\"]"',
    "  fi",
    "fi",
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
    'read -r out <&3 || [[ -n ${out:-} ]] || { echo "gctl: no response (args must be a JSON array)" >&2; exit 1; }',
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

// --- Agent-managed task registry ---
// Persisted tasks created via tasks.create({ persist: true }) are tracked
// here, NOT inside the workspace schema: task status is runtime lifecycle
// data, and workspace task definitions are re-normalized on every save
// and load (which would strip foreign fields). A parallel localStorage
// registry survives reloads so the boot-time GC knows which definitions
// are finished agent one-shots and can prune them.
const AGENT_TASKS_KEY = "gear-shell-agent-tasks";

function loadAgentTaskRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_TASKS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAgentTaskRegistry(registry) {
  try {
    localStorage.setItem(AGENT_TASKS_KEY, JSON.stringify(registry));
  } catch {
    // storage unavailable; GC simply has nothing to prune next boot
  }
}

function markAgentTask(defId) {
  if (!defId) return;
  const registry = loadAgentTaskRegistry();
  if (!registry[defId]) {
    registry[defId] = { status: "", ts: Date.now() };
    saveAgentTaskRegistry(registry);
  }
}

function markAgentTaskStatus(defId, status) {
  if (!defId) return;
  const registry = loadAgentTaskRegistry();
  // Only tracked (persisted agent-managed) definitions; ephemeral tasks
  // are never in the registry, so nothing to record.
  if (!registry[defId] || registry[defId].status === status) return;
  registry[defId] = { ...registry[defId], status, ts: Date.now() };
  saveAgentTaskRegistry(registry);
}

// Boot-time GC: drop persisted agent-managed task definitions that reached
// a terminal status (succeeded/failed/cancelled), and forget registry
// entries whose definition no longer exists. Called from app-shell at
// startup, before any task panels are restored. Settings-created tasks are
// never tracked and never pruned.
export function gcWorkspaceTasks() {
  const workspace = loadActiveWorkspace();
  if (!Array.isArray(workspace.tasks)) return;
  const registry = loadAgentTaskRegistry();
  const terminal = new Set(["succeeded", "failed", "cancelled"]);
  let pruned = false;
  const surviving = workspace.tasks.filter((task) => {
    const entry = registry[task.id];
    if (entry && terminal.has(entry.status)) {
      pruned = true;
      return false;
    }
    return true;
  });
  if (pruned) {
    workspace.tasks = surviving;
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  }
  let registryPruned = false;
  for (const defId of Object.keys(registry)) {
    if (!surviving.some((task) => task.id === defId)) {
      delete registry[defId];
      registryPruned = true;
    }
  }
  if (registryPruned) saveAgentTaskRegistry(registry);
}

// Dockview panel lifecycle -> event ring buffer. Called from app-shell's
// onReady where the other dockview hooks live (getDockviewApi() is null
// before then, so the api instance is passed in).
export function wirePanelEvents(api) {
  if (!api) return;
  const info = (panel) => ({
    id: panel?.id ?? null,
    component: typeof panel?.params?.panelType === "string"
      ? panel.params.panelType
      : null,
    title: panel?.title ?? null,
  });
  api.onDidAddPanel?.((event) => {
    if (event?.panel) pushEvent("panel.added", info(event.panel));
  });
  api.onDidRemovePanel?.((event) => {
    if (event?.panel) pushEvent("panel.removed", info(event.panel));
  });
  api.onDidActivePanelChange?.((event) => {
    if (event?.panel) pushEvent("panel.activated", info(event.panel));
  });
}

// Run a headless (no panel, no persistence) background task and resolve
// with its captured output once the process reaches a terminal status.
// This is the "execute and capture output" primitive for in-page callers:
// the kernel routes task stdout to the worker console, so the only way to
// observe it is to redirect into the per-task log (wrapHeadlessCmd does
// that), wait for the exit code, and read the log file back. Not bridged
// through window.GearShell because the jsfs bridge is synchronous and
// cannot await a promise — the agent-side equivalent is
// tasks.create({ background: true }) + listening for the status event.
export function runHeadlessTask(spec, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(WORKSPACE_TASK_STATUS_EVENT, onEvent);
      destroyWorkspaceTaskSession(taskId);
      resolve(result);
    };
    let taskId;
    let opened;
    try {
      const normalized = normalizeTask(spec);
      const error = validateTask(normalized);
      if (error) {
        resolve({ ok: false, error });
        return;
      }
      opened = addWorkspaceTaskPanel(
        getDockviewApi(),
        normalized,
        loadActiveWorkspace(),
        { background: true },
      );
      taskId = opened?.sessionId;
    } catch (error) {
      resolve({ ok: false, error: error?.message || String(error) });
      return;
    }
    if (taskId == null) {
      resolve({ ok: false, error: "could not start headless task" });
      return;
    }
    const onEvent = async (event) => {
      if (event.detail?.taskId !== taskId) return;
      const status = event.detail.status;
      if (status !== "succeeded" && status !== "failed") return;
      // Read the log file directly instead of trusting the polled
      // taskOutputs cache: the 800ms output poll can lag a fast-exiting
      // task, so a short-lived probe (type -a) would otherwise resolve
      // with empty output. The kernel keeps the task namespace alive
      // until the session is destroyed, so the file is still readable.
      let output = getTaskOutput(taskId);
      try {
        const root = getWanixRoot();
        const session = workspaceTaskSessions.get(taskId);
        if (root && session) {
          const live = await root.readText(taskLogKernelPath(session));
          if (live) output = live;
        }
      } catch {
        // keep the polled cache value
      }
      finish({
        ok: status === "succeeded",
        exitCode: status === "succeeded"
          ? 0
          : (typeof event.detail.error === "number" ? event.detail.error : 1),
        output,
        error: event.detail.error || null,
      });
    };
    window.addEventListener(WORKSPACE_TASK_STATUS_EVENT, onEvent);
    // Race guard: the task may have reached a terminal status before the
    // listener was registered (fast failures). Check the live session.
    const session = workspaceTaskSessions.get(taskId);
    if (
      session && (session.status === "succeeded" || session.status === "failed")
    ) {
      onEvent({
        detail: { taskId, status: session.status, error: session.error },
      });
    }
    timer = setTimeout(
      () => finish({ ok: false, error: "headless task timed out" }),
      timeoutMs,
    );
  });
}

// Direct reference to the api for in-page callers (crush install flow,
// etc.) so they don't have to read window.GearShell at call time. The
// reference is the same object that gets published to the kernel via
// window.GearShell = api, so calls here are identical to calls from
// an agent via gctl.
export const workspaceApi = api;

export { api };
export default api;
