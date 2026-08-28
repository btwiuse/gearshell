// Workspace task panels: the dockview panel component for workspace
// tasks plus its registration helper (split out of panels.js so no
// file exceeds the 500-line budget). Uses the same dependency
// injection table as panels.js via the exported `panelsDep`.

import React, { useEffect, useRef, useState } from "react";
import { panelsDep } from "./panels.js?v=20260812.37";

// Per-workspace-task counter so multiple task panels can coexist.
// Module-scoped so it survives React re-renders but resets on reload.
let workspaceTaskPanelCounter = 0;

function bindSessionEvents(session, setTaskStatus) {
  const updateStatus = (event) => setTaskStatus(event.detail);
  session.task.addEventListener(
    panelsDep("WORKSPACE_TASK_STATUS_EVENT"),
    updateStatus,
  );
  setTaskStatus({
    status: session.status || "created",
    error: session.error || null,
  });
  return () => {
    session.task.removeEventListener(
      panelsDep("WORKSPACE_TASK_STATUS_EVENT"),
      updateStatus,
    );
  };
}

function attachTaskPanelSession(params, api, wrapperRef, setTaskStatus) {
  const wrapper = wrapperRef.current;
  if (!wrapper) return undefined;
  const workspace = panelsDep("loadWorkspace")(params.workspaceId) ||
    panelsDep("loadActiveWorkspace")();
  const session = panelsDep("getWorkspaceTaskSession")(
    params.sessionId,
    params.task,
    workspace,
  );
  const unsubscribe = bindSessionEvents(session, setTaskStatus);
  const detach = panelsDep("attachWorkspaceTaskSession")(
    params.sessionId,
    params.task,
    workspace,
    wrapper,
    api,
  );
  return () => {
    unsubscribe();
    detach?.();
  };
}

export function WorkspaceTaskPanel({ api, params }) {
  const wrapperRef = useRef(null);
  const [taskStatus, setTaskStatus] = useState({
    status: "created",
    error: null,
  });

  useEffect(
    () => attachTaskPanelSession(params, api, wrapperRef, setTaskStatus),
    [api, params.sessionId],
  );

  if (!params.task.term) {
    return React.createElement(HeadlessTaskPanel, {
      ref: wrapperRef,
      task: params.task,
      status: taskStatus,
    });
  }
  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// === HeadlessTaskPanel ===
function HeadlessTaskInfo({ task, envLines }) {
  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { className: "task-headless-command" },
      React.createElement("span", {
        className: "task-headless-prompt",
      }, "$"),
      React.createElement(
        "code",
        null,
        task.cmd || "(no command)",
      ),
    ),
    React.createElement(
      "div",
      { className: "task-headless-wd" },
      React.createElement(
        "span",
        { className: "task-headless-wd-label" },
        "workdir",
      ),
      React.createElement(
        "code",
        null,
        task.wd || "/",
      ),
    ),
    React.createElement(
      "details",
      { className: "task-headless-env" },
      React.createElement("summary", null, `env (${envLines.length})`),
      React.createElement(
        "pre",
        null,
        envLines.join("\n"),
      ),
    ),
  );
}

const HeadlessTaskPanel = React.forwardRef(function HeadlessTaskPanel(
  { task, status },
  ref,
) {
  const envLines = panelsDep("taskEnvLines")(task);
  return React.createElement(
    "div",
    { ref, className: "task-headless panel-content" },
    React.createElement("h2", null, task.name),
    React.createElement(
      "p",
      null,
      status.status === "failed"
        ? status.error?.message || "Task failed to start."
        : status.status === "starting"
        ? "Starting task…"
        : "Headless task: no terminal. Output is captured to a per-task log; read it with gctl tasks.output <id> (live with wanix v0.4.20).",
    ),
    React.createElement(HeadlessTaskInfo, { task, envLines }),
    React.createElement("span", {
      className: `task-headless-status ${status.status}`,
    }, status.status),
  );
});

export function addWorkspaceTaskPanel(
  api,
  task,
  workspace = panelsDep("loadActiveWorkspace")(),
  group,
) {
  const sessionId = ++workspaceTaskPanelCounter;
  const panel = api.addPanel({
    id: `workspace-task-${sessionId}`,
    component: "task",
    params: {
      sessionId,
      task: panelsDep("clone")(task),
      workspaceId: workspace.id,
      panelType: "task",
    },
    title: task.name || task.cmd,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, {
    component: "task",
    task: panelsDep("clone")(task),
    workspaceId: workspace.id,
  });
  panel.api.setActive();
  return panel;
}
