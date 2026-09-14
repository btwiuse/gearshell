// workspace-config-plugins.js — third-party plugin CRUD (WISHLIST #9).
// Split out of workspace-config-api.js for the 500-line rule.
//
// config.plugins mirrors config.providers: manifests live in the shell
// config (audited writes), and every change is reflected into the
// plugin kernel. The jsfs bridge is sync-only, so the kernel reload
// happens fire-and-forget after the config write; list() merges the
// live load status so callers can see the outcome.

import { loadActiveWorkspace } from "./app-workspace-store.js";
import { loadConfig, saveConfig } from "./app-workspace.js";
import { normalizePlugin } from "./app-normalize-plugins.js";
import {
  ensurePluginSystemFiles,
  ensurePluginToolBinds,
} from "./app-plugin-binds.js";
import { primePluginContentCache } from "./app-plugin-cache.js";
import { ensureW9yDependencies } from "./app-w9y-registry.js";
import { DEFAULT_PLUGINS } from "./app-constants.js";
import {
  mergePluginStatus,
  registerPlugin,
  unregisterPlugin,
} from "./plugins.js";
import { pushAuditEntry, redactSecrets } from "./workspace-audit.js";
import { emit } from "./workspace-events.js";

function auditOptions(agentOrOptions) {
  return typeof agentOrOptions === "string"
    ? { agent: agentOrOptions }
    : agentOrOptions;
}

function recordShellChange(prev, next, agentOrOptions) {
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  emit("config.changed", { result: redactSecrets(loadConfig()) });
}

// Shared kernel-reload tail used by both install() and setEnabled() —
// after the config write, push the new plugin set through the same
// reconcile passes the boot path uses, so a freshly installed plugin
// gets its binds + system files + cached wasm + w9y mod on the next
// reload (or immediately if w9y mod apply is queued).
function reconcileAfterChange(plugins) {
  const workspace = loadActiveWorkspace();
  ensurePluginToolBinds(workspace, plugins);
  ensurePluginSystemFiles(workspace, plugins);
  primePluginContentCache(plugins).catch((error) => {
    console.error("plugin cache priming failed", error);
  });
}

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
  recordShellChange(prev, next, agentOrOptions);
  reloadPluginKernel(normalized);
  // Plugin-declared wasm binaries + preset resources become per-task
  // binds immediately; they take effect on the next reload / new task
  // (binds are baked into the namespace at construction).
  reconcileAfterChange(next.plugins);
  // Dual-mode: plugins declaring a w9y mod dependency get it installed
  // (w9y mod apply) on install, matching the manifest pin.
  ensureW9yDependencies(next.plugins).catch((error) => {
    console.error("w9y dependency sync failed", error);
  });
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
  recordShellChange(prev, next, agentOrOptions);
  if (enabled === true) {
    reloadPluginKernel(next.plugins.find((item) => item.id === id));
  } else {
    unregisterPlugin(id);
  }
  reconcileAfterChange(next.plugins);
  // Dual-mode: an enabled plugin may declare w9y mod deps that are not
  // installed yet (e.g. a workspace that enabled bbtex before the mod
  // ever ran); sync them here so the panels resolve.
  if (enabled === true) {
    ensureW9yDependencies(next.plugins).catch((error) => {
      console.error("w9y dependency sync failed", error);
    });
  }
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
  recordShellChange(prev, next, agentOrOptions);
  unregisterPlugin(id);
  reconcileAfterChange(next.plugins);
  return { ok: true, removed: id };
}

export const pluginsApi = {
  list: listPlugins,
  install: installPlugin,
  remove: removePlugin,
  setEnabled: setPluginEnabled,
};

// Export the underlying functions in case a future caller needs them
// outside the configApi surface (e.g. a kernel-internal reconcile
// without an audit entry).
export {
  installPlugin,
  removePlugin,
  setPluginEnabled,
  listPlugins,
  reloadPluginKernel,
};
