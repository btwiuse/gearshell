// workspace-config-api.js — config/workspace read+write namespace
// (split out of workspace-api.js for the 500-line rule).
//
// Beyond the original shell-config surface (getShell/updateShell), this
// exposes the full SYSTEM configuration to agents: the normalized
// {system, runtime, shell} view (getSystem), per-task binds
// (getTaskBinds), and write paths for the system binds and runtime
// (updateBind/removeBind/setBinds/updateRuntime) plus an explicit
// reload() for applying them. All writes go through the audit ring with
// kind:"system" so a human can undo them from Settings. System binds and
// the runtime pin are baked into the namespace at boot, so changes only
// take effect on reload — every write returns a note saying so.

import {
  loadActiveWorkspace,
  loadConfig,
  removeWorkspaceSystemBind,
  saveConfig,
  saveWorkspace,
  saveWorkspaceSystemSettings,
  updateWorkspaceIndex,
  updateWorkspaceSystemBind,
  validateSystemBind,
} from "./app-workspace.js?v=20260826.50";
import {
  normalizeSystemBind,
  normalizeSystemConfig,
} from "./app-normalize.js?v=20260828.51";
import { pushEvent } from "./workspace-events.js?v=20260828.4";
import {
  clearAuditEntries,
  listAuditEntries,
  pushAuditEntry,
  undoAuditEntry,
} from "./workspace-audit.js?v=20260829.25";

// --- Agent write-path helpers ---
// jsfs gives no caller identity, so the agent may pass its name either
// as a trailing argument (gctl config.updateBind '[id,{...},"agent"]') or
// inside an options object; both are accepted.
function auditOptions(agentOrOptions) {
  return typeof agentOrOptions === "string"
    ? { agent: agentOrOptions }
    : agentOrOptions;
}

// Snapshot of the mutable system configuration: the normalized system
// (binds + allowOrigins) plus the runtime pin. This is the prev/next
// slice the audit ring stores for kind:"system" entries.
function systemSnapshot() {
  const workspace = loadActiveWorkspace();
  return {
    system: normalizeSystemConfig(workspace.system),
    runtime: { ...(workspace.runtime || {}) },
  };
}

const SYSTEM_RELOAD_NOTE =
  "takes effect on workspace reload (gctl config.reload applies it)";

// Record a kind:"system" change in the audit ring + event buffer.
function recordSystemChange(prev, agentOrOptions) {
  pushAuditEntry({
    prev,
    next: systemSnapshot(),
    agent: auditOptions(agentOrOptions).agent,
    kind: "system",
  });
  pushEvent("config.changed", { result: loadConfig() });
}

// The root (.) bind is the namespace anchor: without it nothing resolves,
// and unlike every other bind there is no self-healing path. Enforce the
// invariant on wholesale replacement, and on removal.
function requireRootBind(binds) {
  if (!binds.some((bind) => bind.dst === ".")) {
    throw new Error("the root (.) bind is required and may not be removed");
  }
}

export const configApi = {
  getShell: () => loadConfig(),
  updateShell: (patch, agentOrOptions = {}) => {
    const prev = loadConfig();
    const next = { ...prev, ...patch };
    saveConfig(next);
    // Audit the agent-facing write path (not UI saveConfig).
    pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
    const result = loadConfig();
    pushEvent("config.changed", { result });
    return result;
  },
  audit: {
    list: () => listAuditEntries(),
    clear: () => clearAuditEntries(),
    undo: (id) => {
      const result = undoAuditEntry(id);
      if (result.ok) {
        pushEvent("config.changed", { result: loadConfig() });
      }
      return result;
    },
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
  // --- System configuration (agent-visible, audited) ---
  // Normalized full view: system binds + allowOrigins, runtime pin and
  // shell config in one call. The whole workspace is also available raw
  // via getWorkspace.
  getSystem: () => {
    const workspace = loadActiveWorkspace();
    return {
      system: normalizeSystemConfig(workspace.system),
      runtime: { ...(workspace.runtime || {}) },
      shell: loadConfig(),
    };
  },
  // Per-task binds (workspace.binds): the per-task toolset (bash/w9y/
  // gctl/profile) plus anything the workspace declares for task namespaces.
  getTaskBinds: () => loadActiveWorkspace().binds || [],
  // Update a system bind by id; validates + audits + reports the reload
  // requirement. Throws (surfaced as {ok:false,error}) when the id is
  // missing or the bind is invalid.
  updateBind: (id, bind, agentOrOptions = {}) => {
    const prev = systemSnapshot();
    const next = updateWorkspaceSystemBind(id, bind);
    if (!next) throw new Error(`system bind "${id}" not found`);
    recordSystemChange(prev, agentOrOptions);
    return { ok: true, bind: next, note: SYSTEM_RELOAD_NOTE };
  },
  removeBind: (id, agentOrOptions = {}) => {
    const workspace = loadActiveWorkspace();
    const target = workspace.system.binds.find((bind) => bind.id === id);
    if (!target) throw new Error(`system bind "${id}" not found`);
    requireRootBind(workspace.system.binds.filter((bind) => bind.id !== id));
    const prev = systemSnapshot();
    removeWorkspaceSystemBind(id);
    recordSystemChange(prev, agentOrOptions);
    return { ok: true, removed: id, note: SYSTEM_RELOAD_NOTE };
  },
  // Atomically replace the whole system binds list (each validated;
  // the root (.) bind must survive). Useful for resetting to the default
  // layout or reconfiguring the namespace wholesale.
  setBinds: (binds, agentOrOptions = {}) => {
    if (!Array.isArray(binds)) throw new Error("binds must be an array");
    const normalized = binds.map(normalizeSystemBind);
    for (const bind of normalized) {
      const error = validateSystemBind(bind);
      if (error) throw new Error(`bind "${bind.id}": ${error}`);
    }
    requireRootBind(normalized);
    const prev = systemSnapshot();
    const workspace = loadActiveWorkspace();
    workspace.system = normalizeSystemConfig({
      ...workspace.system,
      binds: normalized,
    });
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
    recordSystemChange(prev, agentOrOptions);
    return {
      ok: true,
      binds: workspace.system.binds,
      note: SYSTEM_RELOAD_NOTE,
    };
  },
  // Patch the wanix runtime pin + allowOrigins. Fields left out keep
  // their current values; saveWorkspaceSystemSettings rejects empty
  // module/wasm URLs.
  updateRuntime: (patch = {}, agentOrOptions = {}) => {
    const current = loadActiveWorkspace();
    const prev = systemSnapshot();
    saveWorkspaceSystemSettings({
      moduleUrl: typeof patch?.moduleUrl === "string"
        ? patch.moduleUrl
        : current.runtime?.moduleUrl ?? "",
      wasmUrl: typeof patch?.wasmUrl === "string"
        ? patch.wasmUrl
        : current.runtime?.wasmUrl ?? "",
      allowOrigins: typeof patch?.allowOrigins === "string"
        ? patch.allowOrigins
        : current.system?.allowOrigins ?? "",
    });
    recordSystemChange(prev, agentOrOptions);
    return {
      ok: true,
      runtime: { ...loadActiveWorkspace().runtime },
      note: SYSTEM_RELOAD_NOTE,
    };
  },
  // Apply system-config changes by restarting the workspace. This kills
  // the caller's own task (and every other task) — callers should treat
  // it as "restart to apply".
  reload: () => {
    window.location.reload();
    return { ok: true };
  },
};
