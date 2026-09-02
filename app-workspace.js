// Workspace module facade (500-line rule split). Re-exports the workspace
// CRUD and bind/task CRUD layers from app-workspace-store.js /
// app-workspace-binds.js and re-exports the Crush Playground preset
// layer from plugin/crush-playground/preset-api.js. app.js keeps
// importing everything from this facade so its import line stays
// stable.

import { CONFIG_KEY, DEFAULT_CONFIG } from "./app-constants.js";
import {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  getBuiltinCrushRunnerPresets,
} from "./plugin/crush-playground/preset-api.js";
import {
  normalizeShellConfig,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
} from "./app-normalize.js";
import { writeStoredJson } from "./app-storage.js";
import {
  loadActiveWorkspace,
  notifyWorkspaceChange,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace-store.js";

export {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  ensureCrushRunnerBuiltinsKv,
  getBuiltinCrushRunnerPresets,
} from "./plugin/crush-playground/preset-api.js";
// --- Config ---
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
// --- Re-exported from the split modules (see app-workspace-store.js and
// app-workspace-binds.js) ---
export {
  createWorkspaceFromPreset,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  importWorkspace,
  loadActiveWorkspace,
  loadWorkspace,
  loadWorkspaceIndex,
  migrateWorkspace,
  normalizeWorkspaceName,
  notifyWorkspaceChange,
  parseWorkspaceJson,
  renameWorkspace,
  replaceActiveWorkspace,
  saveWorkspace,
  saveWorkspaceIndex,
  setActiveWorkspaceId,
  uniqueWorkspaceName,
  updateActiveWorkspace,
  updateWorkspaceIndex,
  workspaceIndexEntry,
  workspaceNameExists,
} from "./app-workspace-store.js";
export {
  addWorkspaceBind,
  addWorkspaceSystemBind,
  addWorkspaceTask,
  makeBindItemDraggable,
  removeWorkspaceBind,
  removeWorkspaceSystemBind,
  removeWorkspaceTask,
  reorderWorkspaceBinds,
  reorderWorkspaceSystemBinds,
  saveWorkspaceSystemSettings,
  updateWorkspaceBind,
  updateWorkspaceSystem,
  updateWorkspaceSystemBind,
  updateWorkspaceTask,
  validateSystemBind,
} from "./app-workspace-binds.js";
