// workspace-config-api.js — config/workspace read+write namespace
// (split out of workspace-api.js for the 500-line rule).

import {
  loadActiveWorkspace,
  loadConfig,
  saveConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.21";
import { pushEvent } from "./workspace-events.js?v=20260828.3";

export const configApi = {
  getShell: () => loadConfig(),
  updateShell: (patch) => {
    saveConfig({ ...loadConfig(), ...patch });
    const result = loadConfig();
    pushEvent("config.changed", { result });
    return result;
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
