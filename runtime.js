// Runtime: a diagnostics panel that summarises the wanix system
// state, the active workspace's mounts / task definitions, and the
// live terminal / task sessions.
//
// This module owns the `runtime` dockview panel. The runtime state
// is read from app.js's wanix system / workspace helpers (passed via
// the dep shim) plus the runtimeDep("terminalSessions") / runtimeDep("workspaceTaskSessions")
// Maps (also passed via deps so this module does not need to share
// state with the terminal / task overlay machinery).
//
// Dependency-injection shim: app.js calls `initRuntime(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `runtimeDep(name)`.
// Mirrors the same pattern used by home.js / settings.js /
// crush-runner.js / files.js.

import React, { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { loadStoredMounts } from "./files-mounts.js?v=20260826.38";

let __runtimeDeps = null;
export function initRuntime(dependencies) {
  __runtimeDeps = dependencies;
}
function runtimeDep(name) {
  if (__runtimeDeps == null) {
    throw new Error(
      "runtime: initRuntime() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __runtimeDeps[name];
  if (value === undefined) {
    throw new Error(`runtime: missing dependency ${name}`);
  }
  return value;
}

function BindRow({ bind }) {
  const src = bind.src || (bind.type === "file" ? "(inline)" : "—");
  return React.createElement(
    "div",
    {
      className: "runtime-bind",
      title: bind.type === "file" ? (bind.content || "").slice(0, 200) : src,
    },
    React.createElement("span", { className: "runtime-bind-type" }, bind.type),
    React.createElement("code", { className: "runtime-bind-dst" }, bind.dst),
    React.createElement("span", {
      className: "runtime-bind-arrow",
      "aria-hidden": true,
    }, "→"),
    React.createElement("code", { className: "runtime-bind-src" }, src),
    bind.mode
      ? React.createElement(
        "span",
        { className: "runtime-bind-mode" },
        bind.mode,
      )
      : null,
    bind.union && bind.union !== "after"
      ? React.createElement(
        "span",
        { className: "runtime-bind-union" },
        bind.union,
      )
      : null,
  );
}

async function buildRuntimeSnapshot() {
  const workspace = runtimeDep("loadActiveWorkspace")();
  const taskSessions = [...runtimeDep("workspaceTaskSessions").values()];
  let kernelTaskEntries = "Unavailable";
  try {
    const entries = await runtimeDep("getWanixRoot")().readDir("task");
    kernelTaskEntries = String(
      (Array.isArray(entries) ? entries : []).filter((entry) =>
        entry !== "new" && entry !== "self"
      ).length,
    );
  } catch {
    /* The system may still be starting or the task namespace may be unavailable. */
  }
  const activeWorkspaceTasks =
    taskSessions.filter((session) =>
      session.status === "running" || session.status === "starting"
    ).length;
  const fsaMounts = await loadStoredMounts();
  return {
    ready: runtimeDep("systemReady"),
    moduleUrl: workspace.runtime.moduleUrl ||
      runtimeDep("WANIX_RUNTIME").moduleUrl,
    wasmUrl: workspace.runtime.wasmUrl || runtimeDep("WANIX_RUNTIME").wasmUrl,
    allowedOrigins: workspace.system.allowOrigins || "None",
    systemMounts: workspace.system.binds.length,
    taskMounts: workspace.binds.length,
    systemBinds: workspace.system.binds,
    taskBinds: workspace.binds,
    fsaMounts,
    configuredTasks: workspace.tasks.length,
    terminals: runtimeDep("terminalSessions").size,
    activeTasks: runtimeDep("terminalSessions").size + activeWorkspaceTasks,
    failedTasks:
      taskSessions.filter((session) => session.status === "failed").length,
    kernelTaskEntries,
  };
}

function runtimeItems(snapshot) {
  return [
    ["System", snapshot.ready ? "Ready" : "Starting"],
    ["System mounts", String(snapshot.systemMounts)],
    ["Task mounts", String(snapshot.taskMounts)],
    ["Configured task definitions", String(snapshot.configuredTasks)],
    ["Active Wanix tasks", String(snapshot.activeTasks)],
    ["Kernel task entries", snapshot.kernelTaskEntries],
    ["Failed tasks", String(snapshot.failedTasks)],
    ["Terminal sessions", String(snapshot.terminals)],
    ["Allowed origins", snapshot.allowedOrigins],
  ];
}

function RuntimeBindSection({ title, count, binds, empty }) {
  return React.createElement(
    "section",
    { className: "runtime-binds" },
    React.createElement("h3", null, `${title} (${count})`),
    binds.length === 0
      ? React.createElement("p", { className: "runtime-binds-empty" }, empty)
      : binds.map((bind) =>
        React.createElement(BindRow, { key: bind.id, bind })
      ),
  );
}

function RuntimeBindSections({ snapshot }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(RuntimeBindSection, {
      title: "System mounts",
      count: snapshot.systemMounts,
      binds: snapshot.systemBinds,
      empty: "No system mounts.",
    }),
    React.createElement(RuntimeBindSection, {
      title: "Task mounts",
      count: snapshot.taskMounts,
      binds: snapshot.taskBinds,
      empty: "No task-level mounts.",
    }),
    React.createElement(RuntimeBindSection, {
      title: "Local directory mounts",
      count: snapshot.fsaMounts.length,
      binds: snapshot.fsaMounts.map((mount) => ({
        id: mount.id,
        type: "fsa",
        dst: mount.dst,
        src: mount.name || mount.dst,
      })),
      empty:
        "No local directory (fsa) mounts. Add one from the Files panel Volumes list.",
    }),
  );
}

function RuntimePanel() {
  const [snapshot, setSnapshot] = useState(null);
  const refresh = useCallback(async () => {
    setSnapshot(await buildRuntimeSnapshot());
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    window.addEventListener(runtimeDep("WORKSPACE_CHANGED_EVENT"), refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(
        runtimeDep("WORKSPACE_CHANGED_EVENT"),
        refresh,
      );
    };
  }, [refresh]);
  if (!snapshot) return null;
  const items = runtimeItems(snapshot);
  return React.createElement(
    "div",
    { className: "runtime-panel panel-content" },
    React.createElement(
      "div",
      { className: "runtime-header" },
      React.createElement(Activity, { size: 20, "aria-hidden": true }),
      React.createElement("h2", null, "Runtime diagnostics"),
      React.createElement("button", {
        type: "button",
        title: "Refresh diagnostics",
        "aria-label": "Refresh diagnostics",
        onClick: refresh,
      }, React.createElement(RefreshCw, { size: 15, "aria-hidden": true })),
    ),
    React.createElement(
      "dl",
      { className: "runtime-grid" },
      items.flatMap(([label, value]) => [
        React.createElement("dt", { key: `${label}-label` }, label),
        React.createElement("dd", {
          key: `${label}-value`,
          className: label === "System" && snapshot.ready ? "ready" : "",
        }, value),
      ]),
    ),
    React.createElement(RuntimeBindSections, { snapshot }),
    React.createElement(
      "section",
      { className: "runtime-source" },
      React.createElement("span", null, "Runtime module"),
      React.createElement(
        "code",
        { title: snapshot.moduleUrl },
        snapshot.moduleUrl,
      ),
      React.createElement("span", null, "Wasm module"),
      React.createElement(
        "code",
        { title: snapshot.wasmUrl },
        snapshot.wasmUrl,
      ),
    ),
  );
}

// === Panel registration ===
// Counter for unique Runtime panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload.
let runtimeIdCounter = 0;

// Register a new Runtime panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Runtime from the panel
// menu, and from the restore-saved-panels path on boot.
export function addRuntimePanel(api, group) {
  const id = ++runtimeIdCounter;
  const panel = api.addPanel({
    id: `runtime-${id}`,
    component: "runtime",
    params: { runtimeId: id, panelType: "runtime" },
    title: `Runtime ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = runtimeDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "runtime" });
  panel.api.setActive();
  return panel;
}

export { RuntimePanel };
