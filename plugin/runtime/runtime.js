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
import htm from "htm";

const html = htm.bind(React.createElement);
import { loadStoredMounts } from "../files-mounts.js";

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
  return html`
    <div
      className="runtime-bind"
      title=${bind.type === "file" ? (bind.content || "").slice(0, 200) : src}
    >
      <span className="runtime-bind-type">${bind.type}</span>
      <code className="runtime-bind-dst">${bind.dst}</code>
      <span className="runtime-bind-arrow" aria-hidden=${true}>→</span>
      <code className="runtime-bind-src">${src}</code>
      ${bind.mode
        ? html`<span className="runtime-bind-mode">${bind.mode}</span>`
        : null}
      ${bind.union && bind.union !== "after"
        ? html`<span className="runtime-bind-union">${bind.union}</span>`
        : null}
    </div>
  `;
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
  return html`
    <section className="runtime-binds">
      <h3>${title} (${count})</h3>
      ${binds.length === 0
        ? html`<p className="runtime-binds-empty">${empty}</p>`
        : binds.map((bind) =>
          html`<${BindRow} key=${bind.id} bind=${bind}/>`,
        )}
    </section>
  `;
}

function RuntimeBindSections({ snapshot }) {
  return html`
    <${React.Fragment}>
      <${RuntimeBindSection} title="System mounts" count=${snapshot.systemMounts} binds=${snapshot.systemBinds} empty="No system mounts."/>
      <${RuntimeBindSection} title="Task mounts" count=${snapshot.taskMounts} binds=${snapshot.taskBinds} empty="No task-level mounts."/>
      <${RuntimeBindSection}
        title="Local directory mounts"
        count=${snapshot.fsaMounts.length}
        binds=${snapshot.fsaMounts.map((mount) => ({
          id: mount.id,
          type: "fsa",
          dst: mount.dst,
          src: mount.name || mount.dst,
        }))}
        empty="No local directory (fsa) mounts. Add one from the Files panel Volumes list."
      />
    </${React.Fragment}>
  `;
}

function renderRuntimeGrid(items, ready) {
  return html`
    <dl className="runtime-grid">
      ${items.flatMap(([label, value]) => [
        html`<dt key=${`${label}-label`}>${label}</dt>`,
        html`<dd
          key=${`${label}-value`}
          className=${label === "System" && ready ? "ready" : ""}
        >${value}</dd>`,
      ])}
    </dl>
  `;
}

function renderRuntimeSource({ snapshot }) {
  return html`
    <section className="runtime-source">
      <span>Runtime module</span>
      <code title=${snapshot.moduleUrl}>${snapshot.moduleUrl}</code>
      <span>Wasm module</span>
      <code title=${snapshot.wasmUrl}>${snapshot.wasmUrl}</code>
    </section>
  `;
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
  return html`
    <div className="runtime-panel panel-content">
      <div className="runtime-header">
        <${Activity} size=${20} aria-hidden=${true}/>
        <h2>Runtime diagnostics</h2>
        <button
          type="button"
          title="Refresh diagnostics"
          aria-label="Refresh diagnostics"
          onClick=${refresh}
        >
          <${RefreshCw} size=${15} aria-hidden=${true}/>
        </button>
      </div>
      ${renderRuntimeGrid(items, snapshot.ready)}
      <${RuntimeBindSections} snapshot=${snapshot}/>
      ${renderRuntimeSource({ snapshot })}
    </div>
  `;
}

// Registered as a plugin panel (see runtime-plugin.js); panel opener
// and id counter live in the generic plugin path (openPluginPanel).
export { RuntimePanel };
