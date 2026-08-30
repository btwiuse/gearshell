// Workspace task panel sessions: wanix-task/wanix-term wiring for task
// panels opened by the agent API (GearShell.tasks) or restored from the
// workspace (500-line rule split out of app-sessions.js).

import {
  getWanixRoot,
  systemReady,
  terminalLayer,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { WORKSPACE_TASK_STATUS_EVENT } from "./app-constants.js?v=20260828.109";
import { normalizeTask } from "./app-normalize.js?v=20260828.151";
import { buildEnv } from "./app-terminal-profiles.js?v=20260826.150";
import { attachOverlayTerminalSession } from "./app-terminal-sessions.js?v=20260826.150";
import { html } from "./dom-html.js?v=20260830.4";

export function createBindElement(bind) {
  return html`<wanix-bind
    dst=${bind.dst}
    type=${bind.type}
    perm=${bind.perm}
    union=${bind.union}
    src=${bind.src || null}
  >${bind.content || null}</wanix-bind>`;
}

export function taskEnvironment(env) {
  return env.split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
}

// Workspace task panels default to the terminal env (BASH_ENV + config.env)
// so bash/hush keeps a usable environment; an explicit task env wins.
export function taskEnvLines(def) {
  if (def.env.trim()) {
    return def.env.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  return buildEnv().split(" ").filter(Boolean);
}

export function taskEnvAttribute(def) {
  return taskEnvLines(def).join(" ");
}

// Headless task output capture: the task cmd is wrapped at create time
// with a shell redirection into a per-task log in its own ramfs tmp
// (exec > tmp/<id>.log 2>&1; ...). Ramfs writes are in-place, so a
// page-side poller reads the live file at /task/workspace-task-N/ns/tmp/
// without losing or stalling bytes. (The gojs runtime routes fd 1 to the
// worker console at the runtime level, so kernel fd-binding cannot capture
// gojs stdout — the wrapper is the reliable path.)
const taskOutputs = new Map();

export function taskLogPath(def) {
  // Absolute path inside the task's own namespace: /tmp is the ramfs
  // mount every task gets, so the log lands in ns/tmp regardless of the
  // task's wd. A relative tmp/ would follow the cwd and break capture
  // for tasks that set a working directory.
  return def.log || `/tmp/${def.id || "task"}.log`;
}

export function taskLogKernelPath(session) {
  const def = session.taskDefinition;
  return `task/workspace-task-${session.id}/ns/tmp/${def.id || "task"}.log`;
}

export function getTaskOutput(id) {
  return taskOutputs.get(id) ?? "";
}

export function startTaskOutputCapture(session) {
  const path = taskLogKernelPath(session);
  const poll = async () => {
    try {
      const root = getWanixRoot();
      if (!root) return;
      taskOutputs.set(session.id, await root.readText(path));
    } catch {
      // Task namespace not provisioned yet (kernel busy / task not
      // started); keep the last mirrored value.
    }
  };
  poll();
  session._outputTimer = setInterval(poll, 800);
}

export function stopTaskOutputCapture(session) {
  if (session._outputTimer) clearInterval(session._outputTimer);
  session._outputTimer = null;
}

// Wrap a headless cmd so stdout+stderr land in the task's own log file
// (ramfs tmp), from the first byte. Uses a block redirect `{ cmd; } > log
// 2>&1`, NOT `exec > log` — the gojs kernel mounts files as WritableStreams
// that only commit on close, and an exec-kept fd never closes, so its
// writes stay buffered and vanish. A block's redirection closes at the end
// of the statement, committing every byte. The panel/API keep the ORIGINAL
// cmd; only the task element runs the wrapped form.
function wrapHeadlessCmd(def) {
  const escaped = def.cmd.replace(/'/g, `'\\''`);
  return `bash -c '{ ${escaped}; } > ${taskLogPath(def)} 2>&1'`;
}

// Wrap a term cmd the same way: the kernel execs the first token of cmd
// directly (gojs driver readFile(args[0])), so a cmd like "echo hi; sleep
// 2" would look for /bin/echo (the image only ships bash/gear/w9y) and
// never start. Running the whole cmd under `bash -c` makes the full shell
// grammar available. The outer bash is non-interactive, so the BASH_ENV
// base env from the task env still applies; a wrapped interactive "bash"
// keeps the terminal as its tty.
function wrapTermCmd(def) {
  const escaped = def.cmd.replace(/'/g, `'\\''`);
  return `bash -c '${escaped}'`;
}

function createWorkspaceTaskElement(id, def, workspace) {
  const task = html`<wanix-task
    id=${`workspace-task-${id}`}
    cmd=${def.term ? wrapTermCmd(def) : wrapHeadlessCmd(def)}
    type=${def.type}
    start=""
    for="wanix-system"
    wd=${def.wd || null}
    env=${taskEnvAttribute(def)}
    term=${def.term ? "" : null}
  >
    ${workspace.binds.map(createBindElement)}
  </wanix-task>`;
  return task;
}

function createTaskTerminal(task) {
  task.appendChild(
    html`<wanix-bind dst="winch" src="#task/self/term/winch" />`,
  );
  return html`<wanix-term
    raw=""
    no-scrollbar=""
    path=${`#task/${task.id}/term`}
    for="wanix-system"
  />`;
}

export function createWorkspaceTaskSession(id, taskDefinition, workspace) {
  // Normalize so every caller (API tasks.create, restored panels, Settings)
  // is safe: fields like env/wd default to "" and the session below reads
  // taskDefinition.env.trim() directly.
  const def = normalizeTask(taskDefinition);
  const task = createWorkspaceTaskElement(id, def, workspace);

  let term = null;
  if (def.term) term = createTaskTerminal(task);
  const wrapper = html`<div className="terminal-session">${task}${term}</div>`;
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    task,
    term,
    anchor: null,
    layout: null,
    started: false,
    taskDefinition: def,
    error: null,
    waitsForSystemReady: !systemReady,
    autoActivates: "_connectStarted" in task,
  };
  task.addEventListener("error", (event) => {
    setWorkspaceTaskStatus(
      session,
      "failed",
      event.detail?.error || event.detail || event,
    );
  });
  workspaceTaskSessions.set(id, session);
  // Self-activating runtimes start the task on their own; surface that as
  // "running" once the system is up (the error listener still flips failed).
  if (session.autoActivates && systemReady) {
    session.started = true;
    setWorkspaceTaskStatus(session, "running");
  }
  if (!def.term) startTaskOutputCapture(session);
  startTaskExitPolling(session);
  return session;
}

export function getWorkspaceTaskSession(id, taskDefinition, workspace) {
  return workspaceTaskSessions.get(id) ||
    createWorkspaceTaskSession(id, taskDefinition, workspace);
}

export function destroyWorkspaceTaskSession(id) {
  const session = workspaceTaskSessions.get(id);
  if (!session) return;
  workspaceTaskSessions.delete(id);
  stopTaskOutputCapture(session);
  stopTaskExitPolling(session);
  session.anchor = null;
  session.wrapper.remove();
}

export function setWorkspaceTaskStatus(session, status, error = null) {
  session.status = status;
  session.error = error;
  const detail = { status, error, taskId: session.id };
  // Panels listen on the task element directly (bindSessionEvents in
  // panels-task.js). Non-panel callers (runHeadlessTask, the install
  // flow) hold only the task id, so mirror the event on window — a
  // CustomEvent dispatched on the element does not bubble (bubbles:
  // false by default) and window listeners would never fire.
  session.task.dispatchEvent(
    new CustomEvent(WORKSPACE_TASK_STATUS_EVENT, { detail }),
  );
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_TASK_STATUS_EVENT, { detail }),
  );
}

// Task status: poll the kernel's exit file for the task. Wanix writes
// the process exit code (or "" while alive) to task/<taskId>/exit; a
// non-empty value means the process is gone. We surface exit=0 as
// "succeeded" and anything else as "failed" so the existing
// WORKSPACE_TASK_STATUS_EVENT listeners (panels, agents, runHeadlessTask)
// get a real terminal state. The poll is cheap (small file, ramfs-backed)
// and stops as soon as it sees an exit value.
function startTaskExitPolling(session) {
  const path = `task/workspace-task-${session.id}/exit`;
  const poll = async () => {
    if (!workspaceTaskSessions.has(session.id)) return;
    let text;
    try {
      const root = getWanixRoot();
      if (!root) return;
      text = await root.readText(path);
    } catch {
      return;
    }
    if (text == null) return;
    const trimmed = text.trim();
    if (trimmed === "") return;
    stopTaskExitPolling(session);
    if (trimmed === "0") {
      setWorkspaceTaskStatus(session, "succeeded");
    } else {
      setWorkspaceTaskStatus(session, "failed", `exit ${trimmed}`);
    }
    // Interactive terminals: surface the exit in the buffer (VS Code
    // style) so a process that quits cleanly (a bbtex example on "q",
    // bash running a one-shot script) does not leave a blank terminal
    // with no explanation. The term element is connected by the time a
    // process has run and exited, so _term is available. The kernel
    // homes the cursor when the process exits, so the notice must be
    // repositioned after the last output line - a bare writeln would
    // land at the top and overwrite the first output line.
    const term = session.term?._term;
    if (term && typeof term.writeln === "function") {
      const text = trimmed === "0"
        ? `[Process completed (exit code ${trimmed})]`
        : `[Process exited with code ${trimmed}]`;
      writeAtContentEnd(term, text);
    }
  };
  poll();
  session._exitTimer = setInterval(poll, 500);
}

// Write a line at the end of the terminal's existing content. The kernel
// homes the cursor when a task process exits (and apps that used the
// alternate screen leave it frozen), so the current cursor position is
// unreliable - find the last non-empty buffer row and write there.
function writeAtContentEnd(term, text) {
  const buffer = term.buffer?.active || term._buffer?.active || term._core?.buffer?.active;
  let row = null;
  if (buffer && typeof buffer.getLine === "function") {
    const viewportRows = buffer.rows || 24;
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      // row tracks the 1-based line AFTER the last content line
      if (line && line.translateToString(true).trim() !== "") row = i + 2;
    }
    // The visible screen is at most the viewport tall; content that
    // scrolled away is already above it, so clamp to the bottom row.
    if (row === null) row = 1;
    if (row > viewportRows) row = viewportRows;
  }
  if (row !== null) term.write(`\x1b[${row};1H`);
  term.writeln(text);
}

function stopTaskExitPolling(session) {
  if (session._exitTimer) clearInterval(session._exitTimer);
  session._exitTimer = null;
}

export function wakeWorkspaceTaskSession(session) {
  if (!systemReady || session.started) return;
  session.started = true;
  // The task element self-activates (start attribute + the runtime's
  // connect microtask chain runs allocate/start on its own). An explicit
  // _awake() here or in the overlay wake would re-allocate and throw
  // "Task already allocated", killing the panel terminal. Mirror
  // wakeTerminalSession: let the element do the work.
  if (session.waitsForSystemReady || session.autoActivates) {
    setWorkspaceTaskStatus(session, "running");
    return;
  }
  queueMicrotask(async () => {
    try {
      setWorkspaceTaskStatus(session, "starting");
      await session.task._awake?.();
      await session.term?._awake?.();
      setWorkspaceTaskStatus(session, "running");
    } catch (error) {
      setWorkspaceTaskStatus(session, "failed", error);
      console.error("Workspace task failed to start", error);
    }
  });
}

export function attachWorkspaceTaskSession(
  id,
  taskDefinition,
  workspace,
  anchor,
  api,
) {
  const session = getWorkspaceTaskSession(id, taskDefinition, workspace);
  if (!session.term || !anchor) {
    wakeWorkspaceTaskSession(session);
    return () => {};
  }
  return attachOverlayTerminalSession(session, anchor, api);
}
