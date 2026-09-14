// workspace-config-api.js — config/workspace read+write namespace.
//
// Composes the per-surface split modules (providers, plugins, system
// binds) with the shell CRUD (getShell / updateShell), KV, and audit
// into the single `configApi` object agents and iframe plugins read.
// Each surface has its own module so the audit ring, normalize
// pipeline, and kernel-reconcile tail stay close to their callers
// instead of being a 500-line monolith.

import { loadActiveWorkspace } from "./app-workspace-store.js";
import { loadConfig, saveConfig } from "./app-workspace.js";
import { emit } from "./workspace-events.js";
import { kvConfigApi } from "./plugin/crush-playground/kv-api.js";

import { settingsConfigApi } from "./workspace-config-settings-api.js";
import {
  providersApi,
  modelsApi,
  restoreProviderKeys,
} from "./workspace-config-providers.js";
import { pluginsApi } from "./workspace-config-plugins.js";
import { bindsApi } from "./workspace-config-binds.js";
import {
  clearAuditEntries,
  listAuditEntries,
  pushAuditEntry,
  redactSecrets,
  undoAuditEntry,
} from "./workspace-audit.js";

function auditOptions(agentOrOptions) {
  return typeof agentOrOptions === "string"
    ? { agent: agentOrOptions }
    : agentOrOptions;
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
    emit("config.changed", { result });
    return result;
  },
  audit: {
    list: listAuditEntries,
    clear: clearAuditEntries,
    undo: (id) => {
      const result = undoAuditEntry(id);
      if (result.ok) {
        emit("config.changed", { result: redactSecrets(loadConfig()) });
      }
      return result;
    },
  },
  providers: providersApi,
  models: modelsApi,
  kv: kvConfigApi,
  plugins: pluginsApi,
  ...settingsConfigApi,
  getWorkspace: () => redactSecrets(loadActiveWorkspace()),
  // System binds + runtime pin (split out into workspace-config-binds.js;
  // the bind CRUD keeps its flat top-level shape on configApi so
  // existing iframe plugins see config.updateBind / config.setBinds /
  // config.reload etc. unchanged). addBind is the legacy bind-push
  // helper; updateBind / removeBind / setBinds / updateRuntime /
  // reload all require a workspace reload to take effect.
  ...bindsApi,
};
