// workspace-config-api.js — config/workspace read+write namespace
// (split out of workspace-api.js for the 500-line rule).

import {
  loadActiveWorkspace,
  loadConfig,
  saveConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.33";
import { pushEvent } from "./workspace-events.js?v=20260828.4";
import {
  clearAuditEntries,
  listAuditEntries,
  pushAuditEntry,
  undoAuditEntry,
} from "./workspace-audit.js?v=20260829.8";

export const configApi = {
  getShell: () => loadConfig(),
  updateShell: (patch, agentOrOptions = {}) => {
    const prev = loadConfig();
    const next = { ...prev, ...patch };
    saveConfig(next);
    // Audit the agent-facing write path (not UI saveConfig): jsfs gives
    // no caller identity, so the agent may pass its name either as the
    // second argument (gctl config.updateShell '[{...},"agent-name"]')
    // or inside an options object.
    const options = typeof agentOrOptions === "string"
      ? { agent: agentOrOptions }
      : agentOrOptions;
    pushAuditEntry({ prev, next, agent: options?.agent });
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
};
