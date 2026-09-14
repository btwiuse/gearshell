// workspace-config-binds.js — system bind + runtime + workspace
// bind CRUD exposed to agents. Split out of workspace-config-api.js
// for the 500-line rule.
//
// System binds and the runtime pin are baked into the namespace at
// boot, so changes only take effect on reload — every write returns
// a note saying so. All writes go through the audit ring with
// kind:"system" so a human can undo them from Settings.

import {
  loadActiveWorkspace,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace-store.js";
import {
  removeWorkspaceSystemBind,
  saveWorkspaceSystemSettings,
  updateWorkspaceSystemBind,
  validateSystemBind,
} from "./app-workspace-binds.js";
import { loadConfig } from "./app-workspace.js";
import { normalizeSystemBind, normalizeSystemConfig } from "./app-normalize-system.js";
import { pushAuditEntry, redactSecrets } from "./workspace-audit.js";
import { emit } from "./workspace-events.js";

const SYSTEM_RELOAD_NOTE =
  "takes effect on workspace reload (gear config.reload applies it)";

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

// Record a kind:"system" change in the audit ring + event buffer.
function recordSystemChange(prev, agentOrOptions) {
  pushAuditEntry({
    prev,
    next: systemSnapshot(),
    agent: auditOptions(agentOrOptions).agent,
    kind: "system",
  });
  emit("config.changed", { result: redactSecrets(loadConfig()) });
}

// The root (.) bind is the namespace anchor: without it nothing resolves,
// and unlike every other bind there is no self-healing path. Enforce the
// invariant on wholesale replacement, and on removal.
function requireRootBind(binds) {
  if (!binds.some((bind) => bind.dst === ".")) {
    throw new Error("the root (.) bind is required and may not be removed");
  }
}

// Per-task binds (workspace.binds): the per-task toolset (bash/w9y/
// legacy gctl/profile, now bin/gear) plus anything the workspace declares
// for task namespaces.
function getTaskBinds() {
  return loadActiveWorkspace().binds || [];
}

// Normalized full view: system binds + allowOrigins, runtime pin and
// shell config in one call. The whole workspace is also available raw
// via getWorkspace.
function getSystem() {
  const workspace = loadActiveWorkspace();
  return {
    system: normalizeSystemConfig(workspace.system),
    runtime: { ...(workspace.runtime || {}) },
    shell: redactSecrets(loadConfig()),
  };
}

function addBind(bind) {
  const workspace = loadActiveWorkspace();
  workspace.system.binds.push(bind);
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  return workspace.system.binds;
}

// Update a system bind by id; validates + audits + reports the reload
// requirement. Throws (surfaced as {ok:false,error}) when the id is
// missing or the bind is invalid.
function updateBind(id, bind, agentOrOptions = {}) {
  const prev = systemSnapshot();
  const next = updateWorkspaceSystemBind(id, bind);
  if (!next) throw new Error(`system bind "${id}" not found`);
  recordSystemChange(prev, agentOrOptions);
  return { ok: true, bind: next, note: SYSTEM_RELOAD_NOTE };
}

function removeBind(id, agentOrOptions = {}) {
  const workspace = loadActiveWorkspace();
  const target = workspace.system.binds.find((bind) => bind.id === id);
  if (!target) throw new Error(`system bind "${id}" not found`);
  requireRootBind(workspace.system.binds.filter((bind) => bind.id !== id));
  const prev = systemSnapshot();
  removeWorkspaceSystemBind(id);
  recordSystemChange(prev, agentOrOptions);
  return { ok: true, removed: id, note: SYSTEM_RELOAD_NOTE };
}

// Atomically replace the whole system binds list (each validated;
// the root (.) bind must survive). Useful for resetting to the default
// layout or reconfiguring the namespace wholesale.
function setBinds(binds, agentOrOptions = {}) {
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
}

// Patch the wanix runtime pin + allowOrigins. Fields left out keep
// their current values; saveWorkspaceSystemSettings rejects empty
// module/wasm URLs.
function updateRuntime(patch = {}, agentOrOptions = {}) {
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
}

function reload() {
  window.location.reload();
  return { ok: true };
}

export const bindsApi = {
  getSystem,
  getTaskBinds,
  getBinds: () => loadActiveWorkspace().system.binds,
  addBind,
  updateBind,
  removeBind,
  setBinds,
  updateRuntime,
  reload,
};
