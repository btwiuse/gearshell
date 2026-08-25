// Workspace CRUD, bind/task CRUD, config load/save, and the Crush Runner
// preset config layer (500-line rule split).

import {
  WORKSPACE_INDEX_KEY, WORKSPACE_ACTIVE_KEY, WORKSPACE_KEY_PREFIX,
  WORKSPACE_SCHEMA_VERSION, WORKSPACE_CHANGED_EVENT, DEFAULT_CONFIG, CONFIG_KEY,
  SUPPORTED_BIND_TYPES, SUPPORTED_UNION_MODES, SUPPORTED_SYSTEM_BIND_TYPES,
} from "./app-constants.js?v=20260825.2";
import {
  normalizeShellConfig, normalizeBind, normalizeTask,
  normalizeSystemConfig, normalizeSystemBind, clone, validateBind, validateTask,
  normalizeRuntimeConfig, isLegacySystemMirrorBind, normalizeTerminalProfile,
  normalizeTerminalProfileOrder, normalizeIntegrationUrl, normalizeLauncherOrder,
} from "./app-normalize.js?v=20260825.2";
import { readStoredJson, writeStoredJson, workspaceStorageKey, createWorkspaceId } from "./app-storage.js?v=20260825.2";
import { createWorkspace, getWorkspacePreset } from "./app-workspace-presets.js?v=20260825.2";
import { getBuiltinCrushRunnerPresets, DEFAULT_CRUSH_RUNNER_ACTIVE_ID } from "./crush-runner.js?v=20260812.20";

export function normalizeCrushRunnerPreset(preset = {}) {
  const base = normalizeTerminalProfile(preset);
  return {
    ...base,
    crushrc: typeof preset.crushrc === 'string' ? preset.crushrc : '',
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
    const configured = (config.crushRunnerPresets || []).find((preset) => preset.id === template.id);
    if (configured) {
      for (const [key, value] of Object.entries(configured)) {
        if (value === '' || value == null) continue;
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
  const order = normalizeTerminalProfileOrder(config.crushRunnerPresetOrder, all);
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...all].sort((left, right) => (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0));
}

export function saveCrushRunnerPresets(presets, activeId, order) {
  const config = loadConfig();
  saveConfig({
    ...config,
    crushRunnerPresets: presets.map((preset) => ({ ...preset, builtin: false })),
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(order, presets),
    crushRunnerActiveId: typeof activeId === 'string' && activeId ? activeId : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  });
}

export function migrateWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') return null;
  if (!workspace.version) return createWorkspace(workspace.presetId || 'empty', workspace);
  if (workspace.version > WORKSPACE_SCHEMA_VERSION) return null;
  const migrated = {
    ...createWorkspace(workspace.presetId || 'empty', workspace),
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: workspace.updatedAt || new Date().toISOString(),
  };
  if (workspace.version < 2) {
    migrated.binds = migrated.binds.filter((bind) => !isLegacySystemMirrorBind(bind));
  }
  if (workspace.version < 4) {
    if (migrated.shell.startupPanels.includes('home')) {
      migrated.shell.startupPanels = migrated.shell.startupPanels.map((panel) => panel === 'home' ? 'deck' : panel);
    }
    if (Array.isArray(migrated.ui?.openPanels)) {
      migrated.ui.openPanels = migrated.ui.openPanels.map((panel) =>
        panel?.component === 'home' ? { ...panel, component: 'deck' } : panel
      );
    }
  }
  if (!('activeOpenPanelIndex' in (migrated.ui || {}))) {
    migrated.ui = { ...(migrated.ui || {}), activeOpenPanelIndex: null };
  }
  return migrated;
}

export function loadWorkspace(id) {
  const workspace = migrateWorkspace(readStoredJson(workspaceStorageKey(id), null));
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
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

export function workspaceNameExists(name, excludedId = null) {
  const target = normalizeWorkspaceName(name).toLocaleLowerCase();
  return ensureWorkspaceStore().some((workspace) =>
    workspace.id !== excludedId && normalizeWorkspaceName(workspace.name).toLocaleLowerCase() === target
  );
}

export function uniqueWorkspaceName(baseName, excludedId = null) {
  const base = normalizeWorkspaceName(baseName) || 'Workspace';
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

  const legacy = normalizeShellConfig(readStoredJson(CONFIG_KEY, DEFAULT_CONFIG));
  const workspace = createWorkspace('hush-shell', { shell: legacy });
  saveWorkspace(workspace);
  const nextIndex = [workspaceIndexEntry(workspace)];
  saveWorkspaceIndex(nextIndex);
  try { localStorage.setItem(WORKSPACE_ACTIVE_KEY, workspace.id); } catch { /* no storage */ }
  return nextIndex;
}

export function getActiveWorkspaceId() {
  const index = ensureWorkspaceStore();
  try {
    const activeId = localStorage.getItem(WORKSPACE_ACTIVE_KEY);
    if (activeId && index.some((workspace) => workspace.id === activeId)) return activeId;
  } catch { /* no storage */ }
  return index[0]?.id || 'hush-shell';
}

export function loadActiveWorkspace() {
  return loadWorkspace(getActiveWorkspaceId()) || createWorkspace('hush-shell');
}

export function setActiveWorkspaceId(id) {
  const workspace = loadWorkspace(id);
  if (!workspace) return false;
  try { localStorage.setItem(WORKSPACE_ACTIVE_KEY, id); } catch { return false; }
  notifyWorkspaceChange();
  return true;
}

export function createWorkspaceFromPreset(presetId) {
  const preset = getWorkspacePreset(presetId);
  const workspace = createWorkspace(presetId, {
    id: createWorkspaceId(),
    name: uniqueWorkspaceName(preset.name),
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) return null;
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
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) return null;
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

export function renameWorkspace(id, name) {
  const workspace = loadWorkspace(id);
  const nextName = normalizeWorkspaceName(name);
  if (!workspace) throw new Error('Workspace not found.');
  if (!nextName) throw new Error('Workspace name is required.');
  if (workspaceNameExists(nextName, id)) throw new Error(`A workspace named “${nextName}” already exists.`);
  workspace.name = nextName;
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) {
    throw new Error('Unable to rename the workspace.');
  }
  notifyWorkspaceChange();
  return workspace;
}

export function deleteWorkspace(id) {
  const index = loadWorkspaceIndex();
  if (index.length <= 1 || id === 'hush-shell') return false;
  let activeId = null;
  try { activeId = localStorage.getItem(WORKSPACE_ACTIVE_KEY); } catch { /* no storage */ }
  const nextIndex = index.filter((workspace) => workspace.id !== id);
  if (nextIndex.length === index.length || !saveWorkspaceIndex(nextIndex)) return false;
  try { localStorage.removeItem(workspaceStorageKey(id)); } catch { /* no storage */ }
  if (activeId === id) {
    try { localStorage.setItem(WORKSPACE_ACTIVE_KEY, nextIndex[0].id); } catch { /* no storage */ }
  }
  notifyWorkspaceChange();
  return true;
}

export function parseWorkspaceJson(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Workspace JSON is invalid.');
  }
  const imported = migrateWorkspace(parsed);
  if (!imported) throw new Error('The workspace version is not supported.');
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
    throw new Error('Unable to save the imported workspace.');
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
    throw new Error('Unable to replace the current workspace.');
  }
  notifyWorkspaceChange();
  return workspace;
}

export function updateActiveWorkspace(mutator) {
  const workspace = loadActiveWorkspace();
  mutator(workspace);
  workspace.binds = workspace.binds.map(normalizeBind);
  workspace.tasks = workspace.tasks.map(normalizeTask);
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) return null;
  notifyWorkspaceChange();
  return workspace;
}

export function addWorkspaceBind(bind) {
  const nextBind = normalizeBind(bind);
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.binds.push(nextBind));
}

export function removeWorkspaceBind(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.binds = workspace.binds.filter((bind) => bind.id !== id);
  });
}

export function updateWorkspaceBind(id, bind) {
  const nextBind = normalizeBind({ ...bind, id });
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateActiveWorkspace((activeWorkspace) => {
    const index = activeWorkspace.binds.findIndex((item) => item.id === id);
    if (index !== -1) activeWorkspace.binds[index] = nextBind;
  });
  return workspace?.binds.find((item) => item.id === id) || null;
}

export function reorderWorkspaceBinds(sourceId, targetId, placeAfter) {
  return updateActiveWorkspace((workspace) => {
    const sourceIndex = workspace.binds.findIndex((bind) => bind.id === sourceId);
    const targetIndex = workspace.binds.findIndex((bind) => bind.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;
    const [source] = workspace.binds.splice(sourceIndex, 1);
    const nextTargetIndex = workspace.binds.findIndex((bind) => bind.id === targetId);
    workspace.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

export function validateSystemBind(bind) {
  if (!SUPPORTED_SYSTEM_BIND_TYPES.includes(bind.type)) return 'Unsupported system mount type.';
  if (!bind.dst) return 'A destination path is required.';
  if (bind.dst.startsWith('/')) return 'Destination paths must not start with a slash.';
  if (bind.type === 'ns' && !bind.src.startsWith('#')) return 'Namespace mounts must use a # system path.';
  if ((bind.type === 'fetch' || bind.type === 'archive' || bind.type === 'import') && !bind.src) return `${bind.type} mounts require a source URL.`;
  if (bind.type === 'file' && !bind.src && !bind.content) return 'Provide a URL or inline file content.';
  if (!SUPPORTED_UNION_MODES.includes(bind.union)) return 'Union position must be before or after.';
  if (bind.mode && !/^[0-7]{3,4}$/.test(bind.mode)) return 'Permissions must be an octal mode such as 0644.';
  return null;
}

export function updateWorkspaceSystem(mutator) {
  return updateActiveWorkspace((workspace) => {
    workspace.system = normalizeSystemConfig(workspace.system);
    mutator(workspace.system, workspace);
  });
}

export function saveWorkspaceSystemSettings({ moduleUrl, wasmUrl, allowOrigins }) {
  const nextModuleUrl = moduleUrl.trim();
  const nextWasmUrl = wasmUrl.trim();
  if (!nextModuleUrl) throw new Error('A Wanix runtime module URL is required.');
  if (!nextWasmUrl) throw new Error('A Wanix wasm URL is required.');
  return updateWorkspaceSystem((system, workspace) => {
    workspace.runtime.moduleUrl = nextModuleUrl;
    workspace.runtime.wasmUrl = nextWasmUrl;
    system.allowOrigins = typeof allowOrigins === 'string' ? allowOrigins.trim().replace(/[\s,]+/g, ' ') : '';
  });
}

export function addWorkspaceSystemBind(bind) {
  const nextBind = normalizeSystemBind(bind);
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  return updateWorkspaceSystem((system) => system.binds.push(nextBind));
}

export function updateWorkspaceSystemBind(id, bind) {
  const nextBind = normalizeSystemBind({ ...bind, id });
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateWorkspaceSystem((system) => {
    const index = system.binds.findIndex((item) => item.id === id);
    if (index !== -1) system.binds[index] = nextBind;
  });
  return workspace?.system.binds.find((item) => item.id === id) || null;
}

export function removeWorkspaceSystemBind(id) {
  return updateWorkspaceSystem((system) => {
    system.binds = system.binds.filter((bind) => bind.id !== id);
  });
}

export function reorderWorkspaceSystemBinds(sourceId, targetId, placeAfter) {
  return updateWorkspaceSystem((system) => {
    const sourceIndex = system.binds.findIndex((bind) => bind.id === sourceId);
    const targetIndex = system.binds.findIndex((bind) => bind.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;
    const [source] = system.binds.splice(sourceIndex, 1);
    const nextTargetIndex = system.binds.findIndex((bind) => bind.id === targetId);
    system.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

export function makeBindItemDraggable(item, bind, { list, getDraggedId, setDraggedId, reorder, onReordered }) {
  item.draggable = true;
  item.title = 'Drag to reorder';
  item.setAttribute('aria-label', `${bind.dst || 'Unnamed mount'}, draggable`);

  const clearDropIndicators = () => {
    for (const candidate of list.querySelectorAll('.bind-item.drop-before, .bind-item.drop-after')) {
      candidate.classList.remove('drop-before', 'drop-after');
    }
  };
  item.addEventListener('dragstart', (event) => {
    setDraggedId(bind.id);
    item.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', bind.id);
    }
  });
  item.addEventListener('dragover', (event) => {
    if (!getDraggedId() || getDraggedId() === bind.id) return;
    event.preventDefault();
    const placeAfter = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    clearDropIndicators();
    item.classList.add(placeAfter ? 'drop-after' : 'drop-before');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  item.addEventListener('drop', (event) => {
    const sourceId = getDraggedId();
    if (!sourceId || sourceId === bind.id) return;
    event.preventDefault();
    const placeAfter = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    clearDropIndicators();
    setDraggedId(null);
    if (reorder(sourceId, bind.id, placeAfter)) onReordered();
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    clearDropIndicators();
    setDraggedId(null);
  });
}

export function addWorkspaceTask(task) {
  const nextTask = normalizeTask(task);
  const error = validateTask(nextTask);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.tasks.push(nextTask));
}

export function removeWorkspaceTask(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.tasks = workspace.tasks.filter((task) => task.id !== id);
  });
}

export function updateWorkspaceTask(id, task) {
  const current = loadActiveWorkspace().tasks.find((item) => item.id === id);
  if (!current) return null;
  const nextTask = normalizeTask({ ...current, ...task, id });
  const error = validateTask(nextTask);
  if (error) throw new Error(error);
  const workspace = updateActiveWorkspace((activeWorkspace) => {
    const index = activeWorkspace.tasks.findIndex((item) => item.id === id);
    if (index !== -1) activeWorkspace.tasks[index] = nextTask;
  });
  return workspace?.tasks.find((item) => item.id === id) || null;
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
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* no storage */ }
  notifyWorkspaceChange();
  return workspace.shell;
}

export function setWagiDogEnabled(enabled) {
  saveConfig({ ...loadConfig(), wagiDogEnabled: enabled });
}
