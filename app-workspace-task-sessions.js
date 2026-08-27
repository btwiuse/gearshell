// Workspace task panel sessions: wanix-task/wanix-term wiring for task
// panels opened by the agent API (GearShell.tasks) or restored from the
// workspace (500-line rule split out of app-sessions.js).

import {
  systemReady,
  terminalLayer,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { WORKSPACE_TASK_STATUS_EVENT } from "./app-constants.js?v=20260828.2";
import { normalizeTask } from "./app-normalize.js?v=20260828.1";
import { buildEnv } from "./app-terminal-profiles.js?v=20260826.2";
import { attachOverlayTerminalSession } from "./app-terminal-sessions.js?v=20260826.2";

export function createBindElement(bind) {
  const element = document.createElement("wanix-bind");
  element.setAttribute("dst", bind.dst);
  element.setAttribute("type", bind.type);
  element.setAttribute("perm", bind.perm);
  element.setAttribute("union", bind.union);
  if (bind.src) element.setAttribute("src", bind.src);
  if (bind.content) element.textContent = bind.content;
  return element;
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

function createWorkspaceTaskElement(id, def, workspace) {
  const task = document.createElement("wanix-task");
  task.id = `workspace-task-${id}`;
  task.setAttribute("cmd", def.cmd);
  task.setAttribute("type", def.type);
  task.setAttribute("start", "");
  task.setAttribute("for", "wanix-system");
  if (def.wd) task.setAttribute("wd", def.wd);
  task.setAttribute("env", taskEnvAttribute(def));
  if (def.term) task.setAttribute("term", "");
  for (const bind of workspace.binds) task.appendChild(createBindElement(bind));
  return task;
}

function createTaskTerminal(task) {
  const winchBind = document.createElement("wanix-bind");
  winchBind.setAttribute("dst", "winch");
  winchBind.setAttribute("src", "#task/self/term/winch");
  task.appendChild(winchBind);

  const term = document.createElement("wanix-term");
  term.setAttribute("raw", "");
  term.setAttribute("no-scrollbar", "");
  term.setAttribute("path", `#task/${task.id}/term`);
  term.setAttribute("for", "wanix-system");
  return term;
}

export function createWorkspaceTaskSession(id, taskDefinition, workspace) {
  // Normalize so every caller (API tasks.create, restored panels, Settings)
  // is safe: fields like env/wd default to "" and the session below reads
  // taskDefinition.env.trim() directly.
  const def = normalizeTask(taskDefinition);
  const wrapper = document.createElement("div");
  wrapper.className = "terminal-session";

  const task = createWorkspaceTaskElement(id, def, workspace);

  let term = null;
  if (def.term) {
    term = createTaskTerminal(task);
    wrapper.append(task, term);
  } else {
    wrapper.append(task);
  }
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
  session.anchor = null;
  session.wrapper.remove();
}

export function setWorkspaceTaskStatus(session, status, error = null) {
  session.status = status;
  session.error = error;
  session.task.dispatchEvent(
    new CustomEvent(WORKSPACE_TASK_STATUS_EVENT, {
      detail: { status, error },
    }),
  );
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
  if (!session.term) {
    wakeWorkspaceTaskSession(session);
    return () => {};
  }
  return attachOverlayTerminalSession(session, anchor, api);
}
