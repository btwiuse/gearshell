// Settings-facing config facades. These are stable public operations for
// the Settings UI and iframe, grouped under config.* rather than exposing
// the app.js dependency-injection registry or UI-only helpers.

import {
  createWorkspaceFromPreset,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  importWorkspace,
  loadActiveWorkspace,
  loadWorkspaceIndex,
  parseWorkspaceJson,
  renameWorkspace,
  replaceActiveWorkspace,
  resetConfig,
  saveWorkspace,
  setActiveWorkspaceId,
  uniqueWorkspaceName,
  updateActiveWorkspace,
} from "./app-workspace.js";
import {
  addWorkspaceBind,
  addWorkspaceSystemBind,
  addWorkspaceTask,
  removeWorkspaceBind,
  removeWorkspaceSystemBind,
  removeWorkspaceTask,
  reorderWorkspaceBinds,
  reorderWorkspaceSystemBinds,
  updateWorkspaceBind,
  updateWorkspaceSystemBind,
  updateWorkspaceTask,
  validateSystemBind,
} from "./app-workspace-binds.js";
import {
  listWorkspacePresets,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
} from "./app-workspace-presets.js";
import {
  getTerminalProfiles,
  saveTerminalProfiles,
  terminalCommand,
} from "./app-terminal-profiles.js";
import {
  normalizeBind,
  normalizeLauncherOrder,
  normalizeSystemBind,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  normalizeTask,
  validateBind,
  validateTask,
} from "./app-normalize.js";
import { redactSecrets } from "./workspace-audit.js";
import {
  TERMINAL_PRESET_ICON_OPTIONS,
  WANIX_RUNTIME,
} from "./app-constants.js";

export const settingsConfigApi = {
  reset: resetConfig,
  workspace: {
    list: () => loadWorkspaceIndex(),
    getActive: () => redactSecrets(loadActiveWorkspace()),
    getActiveId: () => getActiveWorkspaceId(),
    ensure: () => ensureWorkspaceStore(),
    select: (id) => setActiveWorkspaceId(id),
    rename: (id, name) => renameWorkspace(id, name),
    createFromPreset: (presetId) => createWorkspaceFromPreset(presetId),
    duplicate: (id) => duplicateWorkspace(id),
    delete: (id) => deleteWorkspace(id),
    parse: (serialized) => parseWorkspaceJson(serialized),
    import: (serialized) => importWorkspace(serialized),
    replaceActive: (serialized) => replaceActiveWorkspace(serialized),
    uniqueName: (name, excludedId) => uniqueWorkspaceName(name, excludedId),
  },
  presets: {
    list: listWorkspacePresets,
    getCustom: loadCustomWorkspacePreset,
    saveCustom: saveCustomWorkspacePreset,
    removeCustom: removeCustomWorkspacePreset,
    uniqueName: uniqueWorkspacePresetName,
  },
  binds: {
    list: () => loadActiveWorkspace().binds || [],
    add: addWorkspaceBind,
    update: updateWorkspaceBind,
    remove: removeWorkspaceBind,
    reorder: reorderWorkspaceBinds,
    set: (binds) => {
      if (!Array.isArray(binds)) throw new Error("binds must be an array");
      const normalized = binds.map(normalizeBind);
      const error = normalized.map(validateBind).find(Boolean);
      if (error) throw new Error(error);
      return updateActiveWorkspace((workspace) => { workspace.binds = normalized; });
    },
    systemList: () => loadActiveWorkspace().system.binds || [],
    systemAdd: addWorkspaceSystemBind,
    systemUpdate: updateWorkspaceSystemBind,
    systemRemove: removeWorkspaceSystemBind,
    systemReorder: reorderWorkspaceSystemBinds,
    systemSet: (binds) => {
      if (!Array.isArray(binds)) throw new Error("system binds must be an array");
      const normalized = binds.map(normalizeSystemBind);
      const error = normalized.map(validateSystemBind).find(Boolean);
      if (error) throw new Error(error);
      if (!normalized.some((bind) => bind.dst === ".")) throw new Error("the root (.) bind is required");
      return updateActiveWorkspace((workspace) => { workspace.system.binds = normalized; });
    },
  },
  tasks: {
    list: () => loadActiveWorkspace().tasks || [],
    add: addWorkspaceTask,
    update: updateWorkspaceTask,
    remove: removeWorkspaceTask,
    set: (tasks) => {
      if (!Array.isArray(tasks)) throw new Error("tasks must be an array");
      const normalized = tasks.map(normalizeTask);
      const error = normalized.map(validateTask).find(Boolean);
      if (error) throw new Error(error);
      return updateActiveWorkspace((workspace) => { workspace.tasks = normalized; });
    },
  },
  terminalIcons: {
    list: () => TERMINAL_PRESET_ICON_OPTIONS.map(({ id, label, name, icon }) => ({
      id,
      label,
      name: name || icon?.displayName || icon?.name || label,
    })),
  },
  terminalProfiles: {
    list: () => getTerminalProfiles(),
    save: saveTerminalProfiles,
    normalize: normalizeTerminalProfile,
    normalizeOrder: normalizeTerminalProfileOrder,
    command: terminalCommand,
  },
  launcher: {
    normalizeOrder: (order) => normalizeLauncherOrder(order),
  },
  runtimeDefaults: () => ({ ...WANIX_RUNTIME }),
};
