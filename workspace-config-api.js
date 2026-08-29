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
} from "./app-workspace.js?v=20260826.95";
import {
  normalizePlugin,
  normalizeProviders,
  normalizeSystemBind,
  normalizeSystemConfig,
} from "./app-normalize.js?v=20260828.96";
import { ensurePluginToolBinds } from "./app-plugin-binds.js?v=20260830.17";
import { DEFAULT_PLUGINS } from "./app-constants.js?v=20260828.54";
import { pushEvent } from "./workspace-events.js?v=20260828.4";
import {
  clearAuditEntries,
  listAuditEntries,
  pushAuditEntry,
  redactSecrets,
  undoAuditEntry,
} from "./workspace-audit.js?v=20260829.70";
import {
  mergePluginStatus,
  registerPlugin,
  unregisterPlugin,
} from "./plugins.js?v=20260829.59";

// --- Agent write-path helpers ---
// jsfs gives no caller identity, so the agent may pass its name either
// as a trailing argument (gear config.updateBind '[id,{...},"agent"]') or
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
  "takes effect on workspace reload (gear config.reload applies it)";

// Record a kind:"system" change in the audit ring + event buffer.
function recordSystemChange(prev, agentOrOptions) {
  pushAuditEntry({
    prev,
    next: systemSnapshot(),
    agent: auditOptions(agentOrOptions).agent,
    kind: "system",
  });
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
}

// The root (.) bind is the namespace anchor: without it nothing resolves,
// and unlike every other bind there is no self-healing path. Enforce the
// invariant on wholesale replacement, and on removal.
function requireRootBind(binds) {
  if (!binds.some((bind) => bind.dst === ".")) {
    throw new Error("the root (.) bind is required and may not be removed");
  }
}

// --- Provider config (WISHLIST #1) ---
// Model providers live in the shell config (config.providers), the same
// store config.getShell / updateShell expose to gear. Writes record audit
// entries like any other shell change; every agent-facing read redacts
// apiKey (providers.list shows hasApiKey instead). The save path keeps
// the stored key whenever the caller sends an empty one, so an agent can
// edit a provider's other fields without ever learning its secret.
function upsertProviderList(current, provider) {
  const existing = current.find((item) => item.id === provider.id);
  const merged = {
    ...provider,
    apiKey: provider.apiKey || existing?.apiKey || "",
  };
  if (!existing) return [...current, merged];
  return current.map((item) => (item.id === provider.id ? merged : item));
}

// Re-attach the stored apiKey to providers whose incoming key is empty.
// Applied on updateShell so a redacted getShell round-trip (apiKey:"")
// cannot wipe keys when an agent patches an unrelated field.
function restoreProviderKeys(prevProviders, nextProviders) {
  const keys = new Map(
    normalizeProviders(prevProviders).map((item) => [item.id, item.apiKey]),
  );
  return normalizeProviders(nextProviders).map((provider) => ({
    ...provider,
    apiKey: provider.apiKey || keys.get(provider.id) || "",
  }));
}

function listProviders() {
  return normalizeProviders(loadConfig().providers).map((provider) => ({
    ...provider,
    apiKey: "",
    hasApiKey: Boolean(provider.apiKey),
  }));
}

function saveProvider(provider, agentOrOptions = {}) {
  const normalized = normalizeProviders([provider])[0];
  if (!normalized) {
    throw new Error("provider requires a name or id");
  }
  const prev = loadConfig();
  const providers = upsertProviderList(
    normalizeProviders(prev.providers),
    normalized,
  );
  const next = { ...prev, providers };
  saveConfig(next);
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
  const saved = normalizeProviders(providers).find(
    (item) => item.id === normalized.id,
  );
  return {
    ok: true,
    provider: {
      ...saved,
      apiKey: "",
      hasApiKey: Boolean(saved?.apiKey),
    },
  };
}

function removeProvider(id, agentOrOptions = {}) {
  const prev = loadConfig();
  const current = normalizeProviders(prev.providers);
  const providers = current.filter((item) => item.id !== id);
  if (providers.length === current.length) {
    throw new Error(`provider "${id}" not found`);
  }
  const next = { ...prev, providers };
  saveConfig(next);
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
  return { ok: true, removed: id };
}

// --- Plugin management (WISHLIST #9) ---
// config.plugins mirrors config.providers: manifests live in the shell
// config (audited writes), and every change is reflected into the plugin
// kernel. The jsfs bridge is sync-only, so the kernel reload happens
// fire-and-forget after the config write; list() merges the live load
// status so callers can see the outcome.
function reloadPluginKernel(manifest) {
  unregisterPlugin(manifest.id);
  registerPlugin(manifest).catch(() => {});
}

function listPlugins() {
  return loadConfig().plugins.map(mergePluginStatus);
}

function installPlugin(manifest, agentOrOptions = {}) {
  const normalized = normalizePlugin(manifest);
  if (!normalized) {
    throw new Error("plugin requires an id");
  }
  if (!normalized.entry && !normalized.iframe?.src &&
      !normalized.wasm?.length && !normalized.preset?.length) {
    throw new Error(
      "plugin requires an entry URL, vfs: path, iframe src, or wasm/preset tools",
    );
  }
  const prev = loadConfig();
  const next = {
    ...prev,
    plugins: [
      ...prev.plugins.filter((item) => item.id !== normalized.id),
      normalized,
    ],
  };
  saveConfig(next);
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  reloadPluginKernel(normalized);
  // Plugin-declared wasm binaries + preset resources become per-task
  // binds immediately; they take effect on the next reload / new task
  // (binds are baked into the namespace at construction).
  ensurePluginToolBinds(loadActiveWorkspace(), next.plugins);
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
  return {
    ok: true,
    id: normalized.id,
    note: "plugin loads asynchronously; config.plugins.list shows status",
  };
}

function setPluginEnabled(id, enabled, agentOrOptions = {}) {
  const prev = loadConfig();
  const exists = prev.plugins.find((item) => item.id === id);
  if (!exists) throw new Error(`plugin "${id}" not found`);
  if (exists.required && enabled !== true) {
    throw new Error(`"${id}" is required and cannot be disabled`);
  }
  const next = {
    ...prev,
    plugins: prev.plugins.map((item) =>
      item.id === id ? { ...item, enabled: enabled === true } : item
    ),
  };
  saveConfig(next);
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  if (enabled === true) {
    reloadPluginKernel(next.plugins.find((item) => item.id === id));
  } else {
    unregisterPlugin(id);
  }
  ensurePluginToolBinds(loadActiveWorkspace(), next.plugins);
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
  return { ok: true, id, enabled: enabled === true };
}

function removePlugin(id, agentOrOptions = {}) {
  const builtin = (DEFAULT_PLUGINS || []).some((item) => item.id === id);
  if (builtin) {
    throw new Error(`"${id}" is a built-in plugin; disable it instead`);
  }
  const required = (loadConfig().plugins || []).some(
    (item) => item.id === id && item.required,
  );
  if (required) {
    throw new Error(`"${id}" is required and cannot be removed`);
  }
  const prev = loadConfig();
  const next = {
    ...prev,
    plugins: prev.plugins.filter((item) => item.id !== id),
  };
  if (next.plugins.length === prev.plugins.length) {
    throw new Error(`plugin "${id}" not found`);
  }
  saveConfig(next);
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  unregisterPlugin(id);
  ensurePluginToolBinds(loadActiveWorkspace(), next.plugins);
  pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
  return { ok: true, removed: id };
}

export const configApi = {
  getShell: () => redactSecrets(loadConfig()),
  updateShell: (patch, agentOrOptions = {}) => {
    const prev = loadConfig();
    const merged = { ...prev, ...(patch || {}) };
    const next = {
      ...merged,
      providers: restoreProviderKeys(prev.providers, merged.providers),
    };
    saveConfig(next);
    // Audit the agent-facing write path (not UI saveConfig).
    pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
    const result = redactSecrets(loadConfig());
    pushEvent("config.changed", { result });
    return result;
  },
  audit: {
    list: () => listAuditEntries(),
    clear: () => clearAuditEntries(),
    undo: (id) => {
      const result = undoAuditEntry(id);
      if (result.ok) {
        pushEvent("config.changed", { result: redactSecrets(loadConfig()) });
      }
      return result;
    },
  },
  providers: {
    list: listProviders,
    save: saveProvider,
    remove: removeProvider,
  },
  plugins: {
    list: listPlugins,
    install: installPlugin,
    remove: removePlugin,
    setEnabled: setPluginEnabled,
  },
  getWorkspace: () => redactSecrets(loadActiveWorkspace()),
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
      shell: redactSecrets(loadConfig()),
    };
  },
  // Per-task binds (workspace.binds): the per-task toolset (bash/w9y/
  // legacy gctl/profile, now bin/gear) plus anything the workspace declares for task namespaces.
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
