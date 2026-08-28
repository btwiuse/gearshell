// Workspace CRUD + active-workspace store: load/save/migrate/import/delete
// workspaces and the index, plus the active-workspace id (500-line rule
// split; re-exported through app-workspace.js).

import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  WORKSPACE_ACTIVE_KEY,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_INDEX_KEY,
  WORKSPACE_SCHEMA_VERSION,
} from "./app-constants.js?v=20260828.10";
import {
  isLegacySystemMirrorBind,
  normalizeBind,
  normalizeShellConfig,
  normalizeTask,
} from "./app-normalize.js?v=20260828.27";
import {
  createWorkspaceId,
  readStoredJson,
  workspaceStorageKey,
  writeStoredJson,
} from "./app-storage.js?v=20260826.8";
import {
  createWorkspace,
  getWorkspacePreset,
} from "./app-workspace-presets.js?v=20260826.26";

export function migrateWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") return null;
  if (!workspace.version) {
    return createWorkspace(workspace.presetId || "empty", workspace);
  }
  if (workspace.version > WORKSPACE_SCHEMA_VERSION) return null;
  const migrated = {
    ...createWorkspace(workspace.presetId || "empty", workspace),
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: workspace.updatedAt || new Date().toISOString(),
  };
  if (workspace.version < 2) {
    migrated.binds = migrated.binds.filter((bind) =>
      !isLegacySystemMirrorBind(bind)
    );
  }
  if (workspace.version < 4) {
    if (migrated.shell.startupPanels.includes("home")) {
      migrated.shell.startupPanels = migrated.shell.startupPanels.map((panel) =>
        panel === "home" ? "deck" : panel
      );
    }
    if (Array.isArray(migrated.ui?.openPanels)) {
      migrated.ui.openPanels = migrated.ui.openPanels.map((panel) =>
        panel?.component === "home" ? { ...panel, component: "deck" } : panel
      );
    }
  }
  if (!("activeOpenPanelIndex" in (migrated.ui || {}))) {
    migrated.ui = { ...(migrated.ui || {}), activeOpenPanelIndex: null };
  }
  return migrated;
}

export function loadWorkspace(id) {
  const workspace = migrateWorkspace(
    readStoredJson(workspaceStorageKey(id), null),
  );
  return workspace;
}

export function saveWorkspace(workspace) {
  const next = migrateWorkspace(workspace);
  if (!next) return false;
  next.updatedAt = new Date().toISOString();
  return writeStoredJson(workspaceStorageKey(next.id), next);
}

export function loadWorkspaceIndex() {
  const index = readStoredJson(WORKSPACE_INDEX_KEY, []);
  return Array.isArray(index) ? index : [];
}

export function saveWorkspaceIndex(index) {
  return writeStoredJson(WORKSPACE_INDEX_KEY, index);
}

export function workspaceIndexEntry(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    presetId: workspace.presetId,
    updatedAt: workspace.updatedAt,
  };
}

export function normalizeWorkspaceName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

export function workspaceNameExists(name, excludedId = null) {
  const target = normalizeWorkspaceName(name).toLocaleLowerCase();
  return ensureWorkspaceStore().some((workspace) =>
    workspace.id !== excludedId &&
    normalizeWorkspaceName(workspace.name).toLocaleLowerCase() === target
  );
}

export function uniqueWorkspaceName(baseName, excludedId = null) {
  const base = normalizeWorkspaceName(baseName) || "Workspace";
  if (!workspaceNameExists(base, excludedId)) return base;
  let index = 2;
  while (workspaceNameExists(`${base} ${index}`, excludedId)) index += 1;
  return `${base} ${index}`;
}

export function updateWorkspaceIndex(workspace) {
  const index = loadWorkspaceIndex();
  const entry = workspaceIndexEntry(workspace);
  const existingIndex = index.findIndex((item) => item.id === workspace.id);
  if (existingIndex === -1) index.push(entry);
  else index[existingIndex] = entry;
  return saveWorkspaceIndex(index);
}

export function notifyWorkspaceChange() {
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
}

export function ensureWorkspaceStore() {
  const index = loadWorkspaceIndex();
  if (index.length > 0) return index;

  const legacy = normalizeShellConfig(
    readStoredJson(CONFIG_KEY, DEFAULT_CONFIG),
  );
  const workspace = createWorkspace("hush-shell", { shell: legacy });
  saveWorkspace(workspace);
  const nextIndex = [workspaceIndexEntry(workspace)];
  saveWorkspaceIndex(nextIndex);
  try {
    localStorage.setItem(WORKSPACE_ACTIVE_KEY, workspace.id);
  } catch { /* no storage */ }
  return nextIndex;
}

export function getActiveWorkspaceId() {
  const index = ensureWorkspaceStore();
  try {
    const activeId = localStorage.getItem(WORKSPACE_ACTIVE_KEY);
    if (activeId && index.some((workspace) => workspace.id === activeId)) {
      return activeId;
    }
  } catch { /* no storage */ }
  return index[0]?.id || "hush-shell";
}

export function loadActiveWorkspace() {
  return loadWorkspace(getActiveWorkspaceId()) || createWorkspace("hush-shell");
}

export function setActiveWorkspaceId(id) {
  const workspace = loadWorkspace(id);
  if (!workspace) return false;
  try {
    localStorage.setItem(WORKSPACE_ACTIVE_KEY, id);
  } catch {
    return false;
  }
  notifyWorkspaceChange();
  return true;
}

export function createWorkspaceFromPreset(presetId) {
  const preset = getWorkspacePreset(presetId);
  const workspace = createWorkspace(presetId, {
    id: createWorkspaceId(),
    name: uniqueWorkspaceName(preset.name),
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    return null;
  }
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

export function duplicateWorkspace(id) {
  const source = loadWorkspace(id);
  if (!source) return null;
  const workspace = createWorkspace(source.presetId, {
    ...source,
    id: createWorkspaceId(),
    name: uniqueWorkspaceName(`${source.name} copy`),
    createdAt: undefined,
    updatedAt: undefined,
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    return null;
  }
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

export function renameWorkspace(id, name) {
  const workspace = loadWorkspace(id);
  const nextName = normalizeWorkspaceName(name);
  if (!workspace) throw new Error("Workspace not found.");
  if (!nextName) throw new Error("Workspace name is required.");
  if (workspaceNameExists(nextName, id)) {
    throw new Error(`A workspace named “${nextName}” already exists.`);
  }
  workspace.name = nextName;
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    throw new Error("Unable to rename the workspace.");
  }
  notifyWorkspaceChange();
  return workspace;
}

export function deleteWorkspace(id) {
  const index = loadWorkspaceIndex();
  if (index.length <= 1 || id === "hush-shell") return false;
  let activeId = null;
  try {
    activeId = localStorage.getItem(WORKSPACE_ACTIVE_KEY);
  } catch { /* no storage */ }
  const nextIndex = index.filter((workspace) => workspace.id !== id);
  if (nextIndex.length === index.length || !saveWorkspaceIndex(nextIndex)) {
    return false;
  }
  try {
    localStorage.removeItem(workspaceStorageKey(id));
  } catch { /* no storage */ }
  if (activeId === id) {
    try {
      localStorage.setItem(WORKSPACE_ACTIVE_KEY, nextIndex[0].id);
    } catch { /* no storage */ }
  }
  notifyWorkspaceChange();
  return true;
}

export function parseWorkspaceJson(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Workspace JSON is invalid.");
  }
  const imported = migrateWorkspace(parsed);
  if (!imported) throw new Error("The workspace version is not supported.");
  return imported;
}

export function importWorkspace(serialized) {
  const imported = parseWorkspaceJson(serialized);
  const workspace = createWorkspace(imported.presetId, {
    ...imported,
    id: createWorkspaceId(),
    name: uniqueWorkspaceName(imported.name),
    createdAt: undefined,
    updatedAt: undefined,
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    throw new Error("Unable to save the imported workspace.");
  }
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

export function replaceActiveWorkspace(serialized) {
  const current = loadActiveWorkspace();
  const imported = parseWorkspaceJson(serialized);
  const workspace = createWorkspace(imported.presetId, {
    ...imported,
    id: current.id,
    name: uniqueWorkspaceName(imported.name, current.id),
    createdAt: current.createdAt,
    updatedAt: undefined,
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    throw new Error("Unable to replace the current workspace.");
  }
  notifyWorkspaceChange();
  return workspace;
}

export function updateActiveWorkspace(mutator) {
  const workspace = loadActiveWorkspace();
  mutator(workspace);
  workspace.binds = workspace.binds.map(normalizeBind);
  workspace.tasks = workspace.tasks.map(normalizeTask);
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    return null;
  }
  notifyWorkspaceChange();
  return workspace;
}
