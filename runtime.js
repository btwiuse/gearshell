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

let __runtimeDeps = null;
export function initRuntime(dependencies) {
  __runtimeDeps = dependencies;
}
function runtimeDep(name) {
  if (__runtimeDeps == null) {
    throw new Error('runtime: initRuntime() has not been called; ensure app.js wires it in.');
  }
  const value = __runtimeDeps[name];
  if (value === undefined) {
    throw new Error(`runtime: missing dependency ${name}`);
  }
  return value;
}

function RuntimePanel() {
  const [snapshot, setSnapshot] = useState(null);
  const refresh = useCallback(async () => {
    const workspace = runtimeDep("loadActiveWorkspace")();
    const taskSessions = [...runtimeDep("workspaceTaskSessions").values()];
    let kernelTaskEntries = 'Unavailable';
    try {
      const entries = await runtimeDep("getWanixRoot")().readDir('task');
      kernelTaskEntries = String((Array.isArray(entries) ? entries : []).filter((entry) => entry !== 'new' && entry !== 'self').length);
    } catch { /* The system may still be starting or the task namespace may be unavailable. */ }
    const activeWorkspaceTasks = taskSessions.filter((session) => session.status === 'running' || session.status === 'starting').length;
    setSnapshot({
      ready: runtimeDep("systemReady"),
      moduleUrl: workspace.runtime.moduleUrl || runtimeDep("WANIX_RUNTIME").moduleUrl,
      wasmUrl: workspace.runtime.wasmUrl || runtimeDep("WANIX_RUNTIME").wasmUrl,
      allowedOrigins: workspace.system.allowOrigins || 'None',
      systemMounts: workspace.system.binds.length,
      taskMounts: workspace.binds.length,
      configuredTasks: workspace.tasks.length,
      terminals: runtimeDep("terminalSessions").size,
      activeTasks: runtimeDep("terminalSessions").size + activeWorkspaceTasks,
      failedTasks: taskSessions.filter((session) => session.status === 'failed').length,
      kernelTaskEntries,
    });
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    window.addEventListener(runtimeDep("WORKSPACE_CHANGED_EVENT"), refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(runtimeDep("WORKSPACE_CHANGED_EVENT"), refresh);
    };
  }, [refresh]);
  if (!snapshot) return null;
  const items = [
    ['System', snapshot.ready ? 'Ready' : 'Starting'],
    ['System mounts', String(snapshot.systemMounts)],
    ['Task mounts', String(snapshot.taskMounts)],
    ['Configured task definitions', String(snapshot.configuredTasks)],
    ['Active Wanix tasks', String(snapshot.activeTasks)],
    ['Kernel task entries', snapshot.kernelTaskEntries],
    ['Failed tasks', String(snapshot.failedTasks)],
    ['Terminal sessions', String(snapshot.terminals)],
    ['Allowed origins', snapshot.allowedOrigins],
  ];
  return React.createElement('div', { className: 'runtime-panel panel-content' },
    React.createElement('div', { className: 'runtime-header' },
      React.createElement(Activity, { size: 20, 'aria-hidden': true }),
      React.createElement('h2', null, 'Runtime diagnostics'),
      React.createElement('button', { type: 'button', title: 'Refresh diagnostics', 'aria-label': 'Refresh diagnostics', onClick: refresh }, React.createElement(RefreshCw, { size: 15, 'aria-hidden': true })),
    ),
    React.createElement('dl', { className: 'runtime-grid' }, items.flatMap(([label, value]) => [
      React.createElement('dt', { key: `${label}-label` }, label),
      React.createElement('dd', { key: `${label}-value`, className: label === 'System' && snapshot.ready ? 'ready' : '' }, value),
    ])),
    React.createElement('section', { className: 'runtime-source' },
      React.createElement('span', null, 'Runtime module'),
      React.createElement('code', { title: snapshot.moduleUrl }, snapshot.moduleUrl),
      React.createElement('span', null, 'Wasm module'),
      React.createElement('code', { title: snapshot.wasmUrl }, snapshot.wasmUrl),
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
    component: 'runtime',
    params: { runtimeId: id, panelType: 'runtime' },
    title: `Runtime ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = runtimeDep('rememberOpenPanel');
  rememberOpenPanel(panel, { component: 'runtime' });
  panel.api.setActive();
  return panel;
}

export { RuntimePanel };
