// Workspace module facade (500-line rule split). Re-exports the workspace
// CRUD and bind/task CRUD layers from app-workspace-store.js /
// app-workspace-binds.js and keeps the Crush Runner preset config layer and
// the shell config load/save here. app.js keeps importing everything from
// this facade so its import line stays stable.

import { CONFIG_KEY, DEFAULT_CONFIG } from "./app-constants.js?v=20260828.101";
import {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  getBuiltinCrushRunnerPresets,
} from "./plugin/crush-runner/crush-runner.js?v=20260826.138";
import {
  normalizeShellConfig,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
} from "./app-normalize.js?v=20260828.143";
import { writeStoredJson } from "./app-storage.js?v=20260826.99";
import {
  loadActiveWorkspace,
  notifyWorkspaceChange,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace-store.js?v=20260826.142";

export function normalizeCrushRunnerPreset(preset = {}) {
  const base = normalizeTerminalProfile(preset);
  return {
    ...base,
    crushrc: typeof preset.crushrc === "string" ? preset.crushrc : "",
    builtin: preset.builtin === true,
  };
}

export function getCrushRunnerPresets(config = loadConfig()) {
  // Build the live list of built-ins, then layer any user-saved
  // override with the matching id on top of each one. Empty-string
  // fields are treated as "user did not set this" so newly introduced
  // defaults (e.g. a new env= line on a builtin) reach existing
  // workspaces whose override still stores '' from before the field
  // existed. The legacy `crush` slot keeps merging into the first
  // builtin by id, so workspaces pinned to that id keep working.
  const builtins = getBuiltinCrushRunnerPresets().map((template) => {
    const merged = { ...template };
    const configured = (config.crushRunnerPresets || []).find((preset) =>
      preset.id === template.id
    );
    if (configured) {
      for (const [key, value] of Object.entries(configured)) {
        if (value === "" || value == null) continue;
        if (!(key in merged)) continue;
        merged[key] = value;
      }
    }
    merged.builtin = true;
    merged.id = template.id;
    return merged;
  });
  // Drop the user-saved entries that we just merged into the builtin
  // slots so we don't render the same preset twice.
  const customs = (config.crushRunnerPresets || []).filter(
    (preset) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(preset.id),
  );
  const all = [...builtins, ...customs];
  const order = normalizeTerminalProfileOrder(
    config.crushRunnerPresetOrder,
    all,
  );
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...all].sort((left, right) =>
    (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0)
  );
}

export function saveCrushRunnerPresets(presets, activeId, order) {
  const config = loadConfig();
  saveConfig({
    ...config,
    crushRunnerPresets: presets.map((preset) => ({
      ...preset,
      builtin: false,
    })),
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(order, presets),
    crushRunnerActiveId: typeof activeId === "string" && activeId
      ? activeId
      : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  });
}
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
} from "./app-workspace-store.js?v=20260826.142";
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
} from "./app-workspace-binds.js?v=20260826.142";
