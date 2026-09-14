// app-workspace.js — shell-config CRUD on top of the active workspace.
// The workspace + bind CRUD layers live in app-workspace-store.js /
// app-workspace-binds.js (re-exported there as needed by the modules
// that own them). This module keeps only the shell-config surface
// (loadConfig / saveConfig / resetConfig / setWagiDogEnabled) so the
// configuration is normalised on every write.

import { CONFIG_KEY, DEFAULT_CONFIG } from "./app-constants.js";
import { normalizeShellConfig } from "./app-normalize.js";
import { writeStoredJson } from "./app-storage.js";
import {
  loadActiveWorkspace,
  notifyWorkspaceChange,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace-store.js";

export function loadConfig() {
  return normalizeShellConfig(loadActiveWorkspace().shell);
}

export function saveConfig(cfg) {
  const workspace = loadActiveWorkspace();
  workspace.shell = normalizeShellConfig(cfg);
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  writeStoredJson(CONFIG_KEY, workspace.shell);
  notifyWorkspaceChange();
}

export function resetConfig() {
  const workspace = loadActiveWorkspace();
  workspace.shell = { ...DEFAULT_CONFIG };
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch { /* no storage */ }
  notifyWorkspaceChange();
  return workspace.shell;
}

export function setWagiDogEnabled(enabled) {
  saveConfig({ ...loadConfig(), wagiDogEnabled: enabled });
}
