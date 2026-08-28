// Workspace preset library: built-in + custom presets, and the
// createWorkspace factory (500-line rule split).

import {
  WORKSPACE_PRESET_INDEX_KEY,
  WORKSPACE_PRESET_KEY_PREFIX,
  WORKSPACE_PRESETS,
  WORKSPACE_SCHEMA_VERSION,
} from "./app-constants.js?v=20260828.11";
import {
  clone,
  isLegacySystemMirrorBind,
  normalizeBind,
  normalizeCustomWorkspacePreset,
  normalizePresetDescription,
  normalizeRuntimeConfig,
  normalizeShellConfig,
  normalizeSystemConfig,
  normalizeTask,
} from "./app-normalize.js?v=20260828.36";
import {
  createWorkspaceId,
  readStoredJson,
  workspacePresetStorageKey,
  writeStoredJson,
} from "./app-storage.js?v=20260826.9";
import {
  normalizeWorkspaceName,
  notifyWorkspaceChange,
} from "./app-workspace.js?v=20260826.35";

export function loadWorkspacePresetIndex() {
  const index = readStoredJson(WORKSPACE_PRESET_INDEX_KEY, []);
  return Array.isArray(index) ? index : [];
}

export function saveWorkspacePresetIndex(index) {
  return writeStoredJson(WORKSPACE_PRESET_INDEX_KEY, index);
}

export function loadCustomWorkspacePreset(id) {
  if (typeof id !== "string" || !id.startsWith("custom-")) return null;
  const preset = readStoredJson(workspacePresetStorageKey(id), null);
  return preset ? normalizeCustomWorkspacePreset(preset) : null;
}

export function getWorkspacePreset(presetId) {
  return WORKSPACE_PRESETS[presetId] || loadCustomWorkspacePreset(presetId) ||
    WORKSPACE_PRESETS.empty;
}

export function listWorkspacePresets() {
  const builtins = Object.entries(WORKSPACE_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name,
    description: preset.description,
    builtin: true,
  }));
  const custom = loadWorkspacePresetIndex()
    .map((entry) => loadCustomWorkspacePreset(entry.id))
    .filter(Boolean)
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      builtin: false,
      updatedAt: preset.updatedAt,
    }));
  return [...builtins, ...custom];
}

export function workspacePresetNameExists(name, excludedId = null) {
  const target = normalizeWorkspaceName(name).toLocaleLowerCase();
  return listWorkspacePresets().some((preset) =>
    preset.id !== excludedId &&
    normalizeWorkspaceName(preset.name).toLocaleLowerCase() === target
  );
}

export function uniqueWorkspacePresetName(baseName, excludedId = null) {
  const base = normalizeWorkspaceName(baseName) || "Preset";
  if (!workspacePresetNameExists(base, excludedId)) return base;
  let index = 2;
  while (workspacePresetNameExists(`${base} ${index}`, excludedId)) index += 1;
  return `${base} ${index}`;
}

export function workspacePresetTemplate(workspace) {
  return {
    runtime: clone(workspace.runtime),
    system: clone(workspace.system),
    binds: clone(workspace.binds),
    tasks: clone(workspace.tasks),
    shell: clone(workspace.shell),
  };
}

export function saveCustomWorkspacePreset(
  id,
  { name, description, workspace } = {},
) {
  const existing = id ? loadCustomWorkspacePreset(id) : null;
  if (id && !existing) throw new Error("Preset not found.");
  const nextName = normalizeWorkspaceName(name);
  if (!nextName) throw new Error("A preset name is required.");
  if (workspacePresetNameExists(nextName, id || null)) {
    throw new Error(`A preset named “${nextName}” already exists.`);
  }
  const now = new Date().toISOString();
  const preset = normalizeCustomWorkspacePreset({
    ...existing,
    id: existing?.id || `custom-${createWorkspaceId()}`,
    name: nextName,
    description: normalizePresetDescription(description),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    template: workspace ? workspacePresetTemplate(workspace) : existing,
  });
  if (!writeStoredJson(workspacePresetStorageKey(preset.id), preset)) {
    throw new Error("Unable to save the preset.");
  }
  const index = loadWorkspacePresetIndex();
  const entry = {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    updatedAt: preset.updatedAt,
  };
  const entryIndex = index.findIndex((item) => item.id === preset.id);
  if (entryIndex === -1) index.push(entry);
  else index[entryIndex] = entry;
  if (!saveWorkspacePresetIndex(index)) {
    throw new Error("Unable to save the preset library.");
  }
  notifyWorkspaceChange();
  return preset;
}

export function removeCustomWorkspacePreset(id) {
  const preset = loadCustomWorkspacePreset(id);
  if (!preset) return false;
  const index = loadWorkspacePresetIndex().filter((entry) => entry.id !== id);
  if (!saveWorkspacePresetIndex(index)) return false;
  try {
    localStorage.removeItem(workspacePresetStorageKey(id));
  } catch {
    return false;
  }
  notifyWorkspaceChange();
  return true;
}

export function createWorkspace(presetId = "hush-shell", overrides = {}) {
  const preset = getWorkspacePreset(presetId);
  const now = new Date().toISOString();
  const id = overrides.id ||
    (presetId === "hush-shell" ? "hush-shell" : createWorkspaceId());
  return {
    version: WORKSPACE_SCHEMA_VERSION,
    id,
    name: overrides.name || preset.name,
    description: overrides.description || preset.description,
    presetId,
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    runtime: normalizeRuntimeConfig({
      ...clone(preset.runtime),
      ...overrides.runtime,
    }),
    system: normalizeSystemConfig(overrides.system || preset.system),
    binds: clone(overrides.binds || preset.binds).map(normalizeBind),
    tasks: clone(overrides.tasks || preset.tasks).map(normalizeTask),
    shell: normalizeShellConfig(overrides.shell),
    ui: { dockviewLayout: null, ...overrides.ui },
  };
}
