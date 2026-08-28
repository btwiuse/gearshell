// workspace-tasks-api.js — the tasks namespace (create/cancel/output)
// plus runHeadlessTask, the "execute and capture output" primitive.
// Split out of workspace-api.js for the 500-line rule; create() and
// runHeadlessTask() were refactored into sub-50-line helpers.

import { getDockviewApi } from "./app-panels-store.js?v=20260826.33";
import {
  getWanixRoot,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { addWorkspaceTaskPanel } from "./panels.js?v=20260812.42";
import {
  addWorkspaceTask,
  loadActiveWorkspace,
} from "./app-workspace.js?v=20260826.33";
import {
  normalizeTask,
  validateTask,
} from "./app-normalize-system.js?v=20260828.2";
import {
  markAgentTask,
  markAgentTaskStatus,
} from "./workspace-task-registry.js?v=20260828.18";
import {
  destroyWorkspaceTaskSession,
  getTaskOutput,
  taskLogKernelPath,
} from "./app-workspace-task-sessions.js?v=20260828.39";
import { groupFor } from "./workspace-open-api.js?v=20260828.18";
import { WORKSPACE_TASK_STATUS_EVENT } from "./app-constants.js?v=20260828.10";

function listTasks() {
  return [...workspaceTaskSessions.values()].map((session) => ({
    id: session.id,
    cmd: session.taskDefinition?.cmd ?? null,
    status: session.status || "created",
    panelId: `workspace-task-${session.id}`,
  }));
}

function createTask(spec, options = {}) {
  const workspace = loadActiveWorkspace();
  if (options.background === true) return openBackgroundTask(workspace, spec);
  if (options.persist !== true) {
    return openEphemeralTask(workspace, spec, options);
  }
  return openPersistedTask(workspace, spec, options);
}

// background = pure headless task with no panel and no workspace
// persistence: normalize+validate directly, open the session via
// addWorkspaceTaskPanel's background branch, and return the task id for
// status-event subscription. Used by one-shot probes (type -a) and
// installs where a visible tab would be noise.
function openBackgroundTask(workspace, spec) {
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
// survive a reload. Restored task panels respawn their workers, and a
// few rounds of test tasks used to pile up zombies that eventually
// wedged the kernel. persist: true opts back into the old behavior
// (definition saved to the workspace + panel remembered for tab
// restore, then GC'd once it reaches a terminal status).
function openEphemeralTask(workspace, spec, options) {
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

function openPersistedTask(workspace, spec, options) {
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
}

function cancelTask(id) {
  // Persisted agent-managed definitions get a terminal status so the
  // boot-time GC prunes them; ephemeral tasks are never stored.
  const session = workspaceTaskSessions.get(Number(id));
  if (session?.taskDefinition) {
    markAgentTaskStatus(session.taskDefinition.id, "cancelled");
  }
  destroyWorkspaceTaskSession(id);
  getDockviewApi()?.getPanel(`workspace-task-${id}`)?.api.close();
  return { ok: true };
}

function taskOutput(id) {
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
}

export const tasksApi = {
  list: listTasks,
  create: createTask,
  cancel: cancelTask,
  output: taskOutput,
};

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
    const started = startHeadlessTask(spec);
    if (!started.ok || started.taskId == null) {
      resolve({
        ok: false,
        error: started.error || "could not start headless task",
      });
      return;
    }
    const taskId = started.taskId;
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
    const onEvent = makeHeadlessStatusHandler(taskId, finish);
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

function startHeadlessTask(spec) {
  try {
    const normalized = normalizeTask(spec);
    const error = validateTask(normalized);
    if (error) return { ok: false, error };
    const opened = addWorkspaceTaskPanel(
      getDockviewApi(),
      normalized,
      loadActiveWorkspace(),
      { background: true },
    );
    return { ok: true, taskId: opened?.sessionId };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function makeHeadlessStatusHandler(taskId, finish) {
  return async (event) => {
    if (event.detail?.taskId !== taskId) return;
    const status = event.detail.status;
    if (status !== "succeeded" && status !== "failed") return;
    // Read the log file directly instead of trusting the polled
    // taskOutputs cache: the 800ms output poll can lag a fast-exiting
    // task, so a short-lived probe (type -a) would otherwise resolve
    // with empty output. The kernel keeps the task namespace alive
    // until the session is destroyed, so the file is still readable.
    let output = getTaskOutput(taskId);
    const live = await readLiveTaskOutput(taskId);
    if (live) output = live;
    finish({
      ok: status === "succeeded",
      exitCode: status === "succeeded"
        ? 0
        : (typeof event.detail.error === "number" ? event.detail.error : 1),
      output,
      error: event.detail.error || null,
    });
  };
}

async function readLiveTaskOutput(taskId) {
  try {
    const root = getWanixRoot();
    const session = workspaceTaskSessions.get(taskId);
    if (root && session) {
      return await root.readText(taskLogKernelPath(session));
    }
  } catch {
    // keep the polled cache value
  }
  return null;
}
