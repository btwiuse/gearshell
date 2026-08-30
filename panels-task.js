// Workspace task panels: the dockview panel component for workspace
// tasks plus its registration helper (split out of panels.js so no
// file exceeds the 500-line budget). Uses the same dependency
// injection table as panels.js via the exported `panelsDep`.

import React, { useEffect, useRef, useState } from "react";
import { panelsDep } from "./panels.js?v=20260812.122";
import { nextPanelIndex } from "./app-panel-ids.js?v=20260828.76";

// Per-workspace-task id minting so multiple task panels can coexist.

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
        : status.status === "succeeded"
        ? "Task finished."
        : status.status === "starting"
        ? "Starting task…"
        : "Headless task: no terminal. Output is captured to a per-task log; read it with gear tasks.output <id> (live with wanix v0.4.20).",
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
  options = {},
) {
  const sessionId = nextPanelIndex("workspace-task");
  // background = pure headless task with no dockview panel at all. The
  // session is created and woken, status events fire as usual, and the
  // caller (e.g. the Crush install flow) subscribes and cleans up via
  // tasks.cancel when it reaches a terminal status. Nothing is
  // remembered for restore.
  if (options.background) {
    const session = panelsDep("getWorkspaceTaskSession")(
      sessionId,
      task,
      workspace,
    );
    panelsDep("attachWorkspaceTaskSession")(
      sessionId,
      task,
      workspace,
      null,
      api,
    );
    return { id: `workspace-task-${sessionId}`, sessionId };
  }
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
    ...(options.group && { position: { referenceGroup: options.group } }),
  });
  // persist = remember the panel for tab restore on reload. Ephemeral
  // (agent-created) tasks skip this: a restored task panel respawns its
  // worker on boot, which is how agent one-shots used to pile up
  // zombies and eventually wedge the kernel.
  if (options.persist !== false) {
    panelsDep("rememberOpenPanel")(panel, {
      component: "task",
      task: panelsDep("clone")(task),
      workspaceId: workspace.id,
    });
  }
  // silent = open in the background so the caller (e.g. the Crush install
  // button) keeps focus. Without this the new tab steals focus and
  // overwrites the active panel selection.
  if (!options.silent) panel.api.setActive();
  return panel;
}
