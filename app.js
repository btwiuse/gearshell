import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewDefaultTab, DockviewReact } from 'dockview-react';
import { Bot, ChevronDown, CircleOff, Code2, House, Music2, Play, Plus, Settings, Terminal, UsersRound } from 'lucide-react';

const debugMode = window.location.search.includes('debug');
let debugErrorsDismissed = false;

function showHomeDebugErrors() {
  if (!debugMode || debugErrorsDismissed) return;
  const errors = window.homeDebugErrors || [];
  if (errors.length === 0) return;
  for (const homeContent of document.querySelectorAll('.home-content')) {
    const output = homeContent.querySelector('.home-debug-errors');
    const dismiss = homeContent.querySelector('.home-debug-dismiss');
    if (!output) continue;
    output.textContent = errors.slice(-3).join('\n\n');
    output.hidden = false;
    if (dismiss) dismiss.hidden = false;
  }
}

function dismissHomeDebugErrors() {
  debugErrorsDismissed = true;
  for (const homeContent of document.querySelectorAll('.home-content')) {
    homeContent.querySelector('.home-debug-errors')?.setAttribute('hidden', '');
    homeContent.querySelector('.home-debug-dismiss')?.setAttribute('hidden', '');
  }
}

function reportHomeError(context, error) {
  console.error(context, error);
  if (!debugMode) return;
  const details = (error && (error.stack || error.message)) || String(error);
  window.homeDebugErrors = window.homeDebugErrors || [];
  window.homeDebugErrors.push(`${context}: ${details}`);
  showHomeDebugErrors();
}

if (debugMode) {
  window.addEventListener('error', () => requestAnimationFrame(showHomeDebugErrors));
  window.addEventListener('unhandledrejection', () => requestAnimationFrame(showHomeDebugErrors));
}

// --- Constants ---
const WANIX = '/opfs/wanix';
const HOME = '/opfs/home';
const HUSH_ENV = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  CLICOLOR_FORCE: '1',
  WANIX,
  HOME,
  PATH: `${HOME}/go/bin:${WANIX}`,
  GOPROXY: 'https://goproxy.up.railway.app',
  GONOSUMDB: '*',
  CRUSH_CORE_UTILS: '1',
  DO_NOT_TRACK: '1',
  CRUSH_DISABLE_PROVIDER_AUTO_UPDATE: '1',
  TERM_WINCH: '/winch',
  LOCATION: window.location.pathname,
  GOMEMLIMIT: '384MiB',
  GOGC: '70',
};
const DEFAULT_CMD = 'hush -rcfile /tmp/profile';
const CONFIG_KEY = 'gear-shell-config';
const DEFAULT_CONFIG = { cmd: DEFAULT_CMD, env: '', startupPanels: [], restoreTabs: false };
const WORKSPACE_INDEX_KEY = 'gear-shell-workspace-index';
const WORKSPACE_ACTIVE_KEY = 'gear-shell-active-workspace';
const WORKSPACE_KEY_PREFIX = 'gear-shell-workspace:';
const WORKSPACE_SCHEMA_VERSION = 2;
const WORKSPACE_CHANGED_EVENT = 'gear-shell-workspace-change';
const WORKSPACE_TASK_STATUS_EVENT = 'gear-shell-task-status';
const SUPPORTED_BIND_TYPES = ['ns', 'file', 'archive'];
const SUPPORTED_SYSTEM_BIND_TYPES = ['ns', 'file', 'fetch', 'archive'];
const SUPPORTED_TASK_TYPES = ['auto', 'gojs', 'wasi', 'js'];
const STARTUP_PANEL_TYPES = ['home', 'terminal', 'settings', 'group', 'codigo', 'crush', 'rickroll'];

const BUILTIN_TERMINAL_PROFILES = [
  { id: 'hush', name: 'Hush', type: 'gojs', builtin: true },
  { id: 'crush', name: 'Crush', program: 'crush', args: '', type: 'gojs', env: '', wd: '', builtin: true },
];

const WANIX_RUNTIME = {
  wasmUrl: 'https://w9y.up.railway.app/go/github.com/justwasm/wanix/wasm@v0.3.30',
  moduleUrl: 'https://justwasm.github.io/wanix/dist/wanix.min.js',
};

const DEFAULT_SYSTEM_CONFIG = {
  binds: [
    { id: 'root', type: 'ns', dst: '.', src: '#ramfs' },
    { id: 'task', type: 'ns', dst: 'task', src: '#task' },
    { id: 'term', type: 'ns', dst: 'term', src: '#term' },
    { id: 'web', type: 'ns', dst: 'web', src: '#web' },
    { id: 'js', type: 'ns', dst: 'js', src: '#js' },
    { id: 'opfs', type: 'ns', dst: 'opfs', src: '#web/opfs', mode: '0755' },
    { id: 'tmp', type: 'ns', dst: 'tmp', src: '#ramfs' },
    { id: 'hush', type: 'fetch', dst: 'hush', src: 'https://w9y.up.railway.app/go/github.com/btwiuse/hush/cmd/hush@v0.5.6', mode: '0755' },
    { id: 'w9y', type: 'fetch', dst: 'w9y', src: 'https://w9y.up.railway.app/go/github.com/btwiuse/w9y/cmd/w9y@v0.0.5', mode: '0755' },
    {
      id: 'boot-profile',
      type: 'file',
      dst: 'tmp/profile',
      mode: '0666',
      content: `function w9y_detect() {
  path="$LOCATION"
  OLDIFS=$IFS
  IFS='/'

  set -- $path

  IFS=$OLDIFS

  for x; do
    [[ -d $HOME/.w9y/$x ]] && continue
    /w9y mod apply -v "$x" && mkdir -p $HOME/.w9y/$x
    [[ $? -eq 0 ]] || continue
    if [[ $x = picoclaw ]]; then
      echo "[INFO] picoclaw successfully installed, type 'picoclaw' to get started"
    fi
    if [[ $x = crush ]]; then
      echo "[INFO] crush successfully installed, type 'crush' to get started"
    fi
  done
}
function ensure_home() {
  [[ -d $HOME ]] || mkdir -p $HOME
}
ensure_home
cd $HOME
w9y_detect
`,
    },
  ],
};

const WORKSPACE_PRESETS = {
  'hush-shell': {
    name: 'Hush Shell',
    description: 'The current Gear Shell environment with Hush and persistent OPFS storage.',
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [],
  },
  empty: {
    name: 'Empty Namespace',
    description: 'A blank in-memory Wanix namespace for composing binds and tasks.',
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [],
  },
  'js-worker': {
    name: 'JavaScript Worker',
    description: 'An inline JavaScript task that can be edited and started in the browser.',
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [
      {
        id: 'main-js',
        type: 'file',
        dst: 'main.js',
        perm: '0766',
        content: "console.log('Wanix JavaScript task started');",
      },
    ],
    tasks: [{
      id: 'main',
      name: 'main.js',
      cmd: 'main.js',
      type: 'js',
      env: '',
      wd: '.',
      fsys: '.',
      term: false,
      autoStart: true,
    }],
  },
  'wasi-terminal': {
    name: 'WASI Terminal',
    description: 'A terminal-ready WASI task. Add a .wasm file before starting it.',
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [{
      id: 'main',
      name: 'main.wasm',
      cmd: 'main.wasm',
      type: 'wasi',
      env: '',
      wd: '.',
      fsys: '.',
      term: true,
      autoStart: false,
    }],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeShellConfig(config) {
  const normalized = {
    cmd: typeof config?.cmd === 'string' && config.cmd.trim() ? config.cmd.trim() : DEFAULT_CMD,
    env: typeof config?.env === 'string' ? config.env : '',
    startupPanels: Array.isArray(config?.startupPanels)
      ? [...new Set(config.startupPanels.filter((panel) => STARTUP_PANEL_TYPES.includes(panel)))]
      : [],
    restoreTabs: config?.restoreTabs === true,
    terminalProfiles: Array.isArray(config?.terminalProfiles)
      ? config.terminalProfiles.map(normalizeTerminalProfile).filter((profile) => profile.program)
      : [],
    defaultTerminalProfileId: typeof config?.defaultTerminalProfileId === 'string'
      ? config.defaultTerminalProfileId
      : 'hush',
  };
  return normalized;
}

function normalizeTerminalProfile(profile = {}) {
  return {
    id: typeof profile.id === 'string' && profile.id ? profile.id : createWorkspaceId(),
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Terminal',
    program: typeof profile.program === 'string' ? profile.program.trim() : '',
    args: typeof profile.args === 'string' ? profile.args.trim() : '',
    type: SUPPORTED_TASK_TYPES.includes(profile.type) ? profile.type : 'gojs',
    env: typeof profile.env === 'string' ? profile.env : '',
    wd: typeof profile.wd === 'string' ? profile.wd.trim() : '',
  };
}

function normalizeBind(bind = {}) {
  const type = bind.type === 'fetch' ? 'file' : bind.type;
  return {
    id: typeof bind.id === 'string' && bind.id ? bind.id : createWorkspaceId(),
    type: SUPPORTED_BIND_TYPES.includes(type) ? type : 'file',
    dst: typeof bind.dst === 'string' ? bind.dst.trim() : '',
    src: typeof bind.src === 'string' ? bind.src.trim() : '',
    content: typeof bind.content === 'string' ? bind.content : '',
    perm: typeof bind.perm === 'string' && bind.perm ? bind.perm : '0644',
    union: typeof bind.union === 'string' && bind.union ? bind.union : 'after',
  };
}

const LEGACY_SYSTEM_MIRROR_BINDS = new Map([
  ['task', { dst: 'task', src: '#task' }],
  ['term', { dst: 'term', src: '#term' }],
  ['web', { dst: 'web', src: '#web' }],
  ['js', { dst: 'js', src: '#js' }],
  ['opfs', { dst: 'opfs', src: '#web/opfs' }],
  ['tmp', { dst: 'tmp', src: '#ramfs' }],
  ['root', { dst: '.', src: '#ramfs' }],
]);

function isLegacySystemMirrorBind(bind) {
  const expected = LEGACY_SYSTEM_MIRROR_BINDS.get(bind.id);
  return bind.type === 'ns' && expected?.dst === bind.dst && expected.src === bind.src;
}

function normalizeSystemBind(bind = {}) {
  return {
    id: typeof bind.id === 'string' && bind.id ? bind.id : createWorkspaceId(),
    type: SUPPORTED_SYSTEM_BIND_TYPES.includes(bind.type) ? bind.type : 'file',
    dst: typeof bind.dst === 'string' ? bind.dst.trim() : '',
    src: typeof bind.src === 'string' ? bind.src.trim() : '',
    content: typeof bind.content === 'string' ? bind.content : '',
    mode: typeof bind.mode === 'string' ? bind.mode : '',
  };
}

function normalizeSystemConfig(system) {
  const defaults = clone(DEFAULT_SYSTEM_CONFIG);
  const binds = Array.isArray(system?.binds)
    ? system.binds.map(normalizeSystemBind)
    : defaults.binds.map(normalizeSystemBind);
  const legacyProfile = system?.profile;
  if (legacyProfile && !binds.some((bind) => bind.id === 'boot-profile' || bind.dst === 'tmp/profile')) {
    binds.push(normalizeSystemBind({ ...legacyProfile, id: 'boot-profile', type: 'file' }));
  }
  return {
    binds,
  };
}

function validateBind(bind) {
  if (!SUPPORTED_BIND_TYPES.includes(bind.type)) return 'Unsupported mount type.';
  if (!bind.dst) return 'A destination path is required.';
  if (bind.dst.startsWith('/')) return 'Destination paths must not start with a slash.';
  if (bind.type === 'ns' && !bind.src.startsWith('#')) return 'Namespace mounts must use a # system path.';
  if (bind.type === 'file' && !bind.src && !bind.content) {
    return 'Provide a URL or inline file content.';
  }
  if (bind.type === 'archive' && !bind.src) return 'Archive mounts require a source URL.';
  if (!/^[0-7]{3,4}$/.test(bind.perm)) return 'Permissions must be an octal mode such as 0644.';
  return null;
}

function normalizeTask(task = {}) {
  return {
    id: typeof task.id === 'string' && task.id ? task.id : createWorkspaceId(),
    name: typeof task.name === 'string' && task.name ? task.name : 'Task',
    cmd: typeof task.cmd === 'string' ? task.cmd.trim() : '',
    type: SUPPORTED_TASK_TYPES.includes(task.type) ? task.type : 'auto',
    env: typeof task.env === 'string' ? task.env : '',
    wd: typeof task.wd === 'string' ? task.wd.trim() : '',
    fsys: typeof task.fsys === 'string' ? task.fsys.trim() : '',
    term: task.term !== false,
    autoStart: task.autoStart === true,
  };
}

function validateTask(task) {
  if (!task.cmd) return 'A command is required.';
  if (!SUPPORTED_TASK_TYPES.includes(task.type)) return 'Unsupported task type.';
  if (task.wd.startsWith('/')) return 'Working directories must not start with a slash.';
  return null;
}

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key}`, error);
    return false;
  }
}

function workspaceStorageKey(id) {
  return `${WORKSPACE_KEY_PREFIX}${id}`;
}

function createWorkspaceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createWorkspace(presetId = 'hush-shell', overrides = {}) {
  const preset = WORKSPACE_PRESETS[presetId] || WORKSPACE_PRESETS.empty;
  const now = new Date().toISOString();
  const id = overrides.id || (presetId === 'hush-shell' ? 'hush-shell' : createWorkspaceId());
  return {
    version: WORKSPACE_SCHEMA_VERSION,
    id,
    name: overrides.name || preset.name,
    description: overrides.description || preset.description,
    presetId,
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    runtime: { ...clone(preset.runtime), ...overrides.runtime },
    system: normalizeSystemConfig(overrides.system || preset.system),
    binds: clone(overrides.binds || preset.binds).map(normalizeBind),
    tasks: clone(overrides.tasks || preset.tasks).map(normalizeTask),
    shell: normalizeShellConfig(overrides.shell),
    ui: { dockviewLayout: null, ...overrides.ui },
  };
}

function migrateWorkspace(workspace) {
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
  return migrated;
}

function loadWorkspace(id) {
  const workspace = migrateWorkspace(readStoredJson(workspaceStorageKey(id), null));
  return workspace;
}

function saveWorkspace(workspace) {
  const next = migrateWorkspace(workspace);
  if (!next) return false;
  next.updatedAt = new Date().toISOString();
  return writeStoredJson(workspaceStorageKey(next.id), next);
}

function loadWorkspaceIndex() {
  const index = readStoredJson(WORKSPACE_INDEX_KEY, []);
  return Array.isArray(index) ? index : [];
}

function saveWorkspaceIndex(index) {
  return writeStoredJson(WORKSPACE_INDEX_KEY, index);
}

function workspaceIndexEntry(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    presetId: workspace.presetId,
    updatedAt: workspace.updatedAt,
  };
}

function normalizeWorkspaceName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

function workspaceNameExists(name, excludedId = null) {
  const target = normalizeWorkspaceName(name).toLocaleLowerCase();
  return ensureWorkspaceStore().some((workspace) =>
    workspace.id !== excludedId && normalizeWorkspaceName(workspace.name).toLocaleLowerCase() === target
  );
}

function uniqueWorkspaceName(baseName, excludedId = null) {
  const base = normalizeWorkspaceName(baseName) || 'Workspace';
  if (!workspaceNameExists(base, excludedId)) return base;
  let index = 2;
  while (workspaceNameExists(`${base} ${index}`, excludedId)) index += 1;
  return `${base} ${index}`;
}

function updateWorkspaceIndex(workspace) {
  const index = loadWorkspaceIndex();
  const entry = workspaceIndexEntry(workspace);
  const existingIndex = index.findIndex((item) => item.id === workspace.id);
  if (existingIndex === -1) index.push(entry);
  else index[existingIndex] = entry;
  return saveWorkspaceIndex(index);
}

function notifyWorkspaceChange() {
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
}

function ensureWorkspaceStore() {
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

function getActiveWorkspaceId() {
  const index = ensureWorkspaceStore();
  try {
    const activeId = localStorage.getItem(WORKSPACE_ACTIVE_KEY);
    if (activeId && index.some((workspace) => workspace.id === activeId)) return activeId;
  } catch { /* no storage */ }
  return index[0]?.id || 'hush-shell';
}

function loadActiveWorkspace() {
  return loadWorkspace(getActiveWorkspaceId()) || createWorkspace('hush-shell');
}

function setActiveWorkspaceId(id) {
  const workspace = loadWorkspace(id);
  if (!workspace) return false;
  try { localStorage.setItem(WORKSPACE_ACTIVE_KEY, id); } catch { return false; }
  notifyWorkspaceChange();
  return true;
}

function createWorkspaceFromPreset(presetId) {
  const preset = WORKSPACE_PRESETS[presetId] || WORKSPACE_PRESETS.empty;
  const workspace = createWorkspace(presetId, {
    id: createWorkspaceId(),
    name: uniqueWorkspaceName(preset.name),
  });
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) return null;
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

function duplicateWorkspace(id) {
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

function renameWorkspace(id, name) {
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

function deleteWorkspace(id) {
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

function parseWorkspaceJson(serialized) {
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

function importWorkspace(serialized) {
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

function replaceActiveWorkspace(serialized) {
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

function updateActiveWorkspace(mutator) {
  const workspace = loadActiveWorkspace();
  mutator(workspace);
  workspace.binds = workspace.binds.map(normalizeBind);
  workspace.tasks = workspace.tasks.map(normalizeTask);
  if (!saveWorkspace(workspace) || !updateWorkspaceIndex(workspace)) return null;
  notifyWorkspaceChange();
  return workspace;
}

function addWorkspaceBind(bind) {
  const nextBind = normalizeBind(bind);
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.binds.push(nextBind));
}

function removeWorkspaceBind(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.binds = workspace.binds.filter((bind) => bind.id !== id);
  });
}

function updateWorkspaceBind(id, bind) {
  const nextBind = normalizeBind({ ...bind, id });
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateActiveWorkspace((activeWorkspace) => {
    const index = activeWorkspace.binds.findIndex((item) => item.id === id);
    if (index !== -1) activeWorkspace.binds[index] = nextBind;
  });
  return workspace?.binds.find((item) => item.id === id) || null;
}

function reorderWorkspaceBinds(sourceId, targetId, placeAfter) {
  return updateActiveWorkspace((workspace) => {
    const sourceIndex = workspace.binds.findIndex((bind) => bind.id === sourceId);
    const targetIndex = workspace.binds.findIndex((bind) => bind.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;
    const [source] = workspace.binds.splice(sourceIndex, 1);
    const nextTargetIndex = workspace.binds.findIndex((bind) => bind.id === targetId);
    workspace.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

function validateSystemBind(bind) {
  if (!SUPPORTED_SYSTEM_BIND_TYPES.includes(bind.type)) return 'Unsupported system mount type.';
  if (!bind.dst) return 'A destination path is required.';
  if (bind.dst.startsWith('/')) return 'Destination paths must not start with a slash.';
  if (bind.type === 'ns' && !bind.src.startsWith('#')) return 'Namespace mounts must use a # system path.';
  if ((bind.type === 'fetch' || bind.type === 'archive') && !bind.src) return `${bind.type} mounts require a source URL.`;
  if (bind.type === 'file' && !bind.src && !bind.content) return 'Provide a URL or inline file content.';
  if (bind.mode && !/^[0-7]{3,4}$/.test(bind.mode)) return 'Permissions must be an octal mode such as 0644.';
  return null;
}

function updateWorkspaceSystem(mutator) {
  return updateActiveWorkspace((workspace) => {
    workspace.system = normalizeSystemConfig(workspace.system);
    mutator(workspace.system, workspace);
  });
}

function saveWorkspaceSystemSettings({ moduleUrl, wasmUrl }) {
  const nextModuleUrl = moduleUrl.trim();
  const nextWasmUrl = wasmUrl.trim();
  if (!nextModuleUrl) throw new Error('A Wanix runtime module URL is required.');
  if (!nextWasmUrl) throw new Error('A Wanix wasm URL is required.');
  return updateWorkspaceSystem((system, workspace) => {
    workspace.runtime.moduleUrl = nextModuleUrl;
    workspace.runtime.wasmUrl = nextWasmUrl;
  });
}

function addWorkspaceSystemBind(bind) {
  const nextBind = normalizeSystemBind(bind);
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  return updateWorkspaceSystem((system) => system.binds.push(nextBind));
}

function updateWorkspaceSystemBind(id, bind) {
  const nextBind = normalizeSystemBind({ ...bind, id });
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateWorkspaceSystem((system) => {
    const index = system.binds.findIndex((item) => item.id === id);
    if (index !== -1) system.binds[index] = nextBind;
  });
  return workspace?.system.binds.find((item) => item.id === id) || null;
}

function removeWorkspaceSystemBind(id) {
  return updateWorkspaceSystem((system) => {
    system.binds = system.binds.filter((bind) => bind.id !== id);
  });
}

function reorderWorkspaceSystemBinds(sourceId, targetId, placeAfter) {
  return updateWorkspaceSystem((system) => {
    const sourceIndex = system.binds.findIndex((bind) => bind.id === sourceId);
    const targetIndex = system.binds.findIndex((bind) => bind.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;
    const [source] = system.binds.splice(sourceIndex, 1);
    const nextTargetIndex = system.binds.findIndex((bind) => bind.id === targetId);
    system.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

function makeBindItemDraggable(item, bind, { list, getDraggedId, setDraggedId, reorder, onReordered }) {
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

function addWorkspaceTask(task) {
  const nextTask = normalizeTask(task);
  const error = validateTask(nextTask);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.tasks.push(nextTask));
}

function removeWorkspaceTask(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.tasks = workspace.tasks.filter((task) => task.id !== id);
  });
}

function updateWorkspaceTask(id, task) {
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
function loadConfig() {
  return normalizeShellConfig(loadActiveWorkspace().shell);
}
function saveConfig(cfg) {
  const workspace = loadActiveWorkspace();
  workspace.shell = normalizeShellConfig(cfg);
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  writeStoredJson(CONFIG_KEY, workspace.shell);
  notifyWorkspaceChange();
}
function resetConfig() {
  const workspace = loadActiveWorkspace();
  workspace.shell = { ...DEFAULT_CONFIG };
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* no storage */ }
  notifyWorkspaceChange();
  return workspace.shell;
}

const openPanelSnapshots = new Map();

function persistOpenPanels() {
  const workspace = loadActiveWorkspace();
  workspace.ui = {
    ...workspace.ui,
    openPanels: [...openPanelSnapshots.values()].map(clone),
  };
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
}

function rememberOpenPanel(panel, snapshot) {
  openPanelSnapshots.set(panel.id, snapshot);
  persistOpenPanels();
}

function forgetOpenPanel(panelId) {
  if (!openPanelSnapshots.delete(panelId)) return;
  persistOpenPanels();
}

function getSavedOpenPanels() {
  const panels = loadActiveWorkspace().ui?.openPanels;
  if (!Array.isArray(panels)) return [];
  return panels.filter((panel) => panel && typeof panel === 'object' &&
    (STARTUP_PANEL_TYPES.includes(panel.component) || panel.component === 'fallback' || panel.component === 'task')
  );
}

function getTerminalProfiles(config = loadConfig()) {
  const hush = {
    ...BUILTIN_TERMINAL_PROFILES[0],
    program: config.cmd.split(/\s+/, 1)[0] || 'hush',
    args: config.cmd.replace(/^\S+\s*/, ''),
    env: config.env,
    wd: '',
  };
  const configuredProfiles = new Map(config.terminalProfiles.map((profile) => [profile.id, profile]));
  const builtinIds = new Set(BUILTIN_TERMINAL_PROFILES.map((profile) => profile.id));
  const builtins = [hush, ...BUILTIN_TERMINAL_PROFILES.slice(1)].map((profile) => ({
    ...profile,
    ...configuredProfiles.get(profile.id),
    builtin: true,
  }));
  return [
    ...builtins,
    ...config.terminalProfiles.filter((profile) => !builtinIds.has(profile.id)),
  ];
}

function getDefaultTerminalProfile(config = loadConfig()) {
  return getTerminalProfiles(config).find((profile) => profile.id === config.defaultTerminalProfileId)
    || getTerminalProfiles(config)[0];
}

function terminalCommand(profile) {
  return profile.cmd || [profile.program, profile.args].filter(Boolean).join(' ');
}

function saveTerminalProfiles(profiles, defaultProfileId) {
  const config = loadConfig();
  const normalizedProfiles = profiles.map(normalizeTerminalProfile);
  const hush = normalizedProfiles.find((profile) => profile.id === 'hush');
  saveConfig({
    ...config,
    terminalProfiles: normalizedProfiles,
    defaultTerminalProfileId: defaultProfileId,
    ...(hush ? { cmd: terminalCommand(hush) || DEFAULT_CMD, env: hush.env } : {}),
  });
}

function buildEnv(envText = loadConfig().env) {
  const env = { ...HUSH_ENV };
  if (envText.trim()) {
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        const [key, ...rest] = trimmed.split('=');
        if (key) env[key] = rest.join('=');
      }
    }
  }
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ');
}

// --- Terminal ID counter ---
let terminalIdCounter = 0;

function createWanixBindElement(bind) {
  const element = document.createElement('wanix-bind');
  if (bind.type && bind.type !== 'ns') element.setAttribute('type', bind.type);
  element.setAttribute('dst', bind.dst);
  if (bind.src) element.setAttribute('src', bind.src);
  if (bind.mode) element.setAttribute('mode', bind.mode);
  if (bind.content) element.textContent = bind.content;
  return element;
}

function createWanixSystem(workspace = loadActiveWorkspace()) {
  const host = document.getElementById('wanix-host');
  if (!host) throw new Error('Unable to find the Wanix host.');
  const system = document.createElement('wanix-system');
  system.id = 'wanix-system';
  system.setAttribute('wasm', workspace.runtime.wasmUrl || WANIX_RUNTIME.wasmUrl);

  const appRoot = document.createElement('div');
  appRoot.id = 'app-root';
  const terminalLayer = document.createElement('div');
  terminalLayer.id = 'terminal-layer';
  system.append(appRoot, terminalLayer);
  for (const bind of workspace.system.binds) system.appendChild(createWanixBindElement(bind));
  host.replaceChildren(system);
  return system;
}

// wanix elements inside dockview need an explicit system reference because
// dockview isolates panel content from the wanix-system ancestor.
const systemWorkspace = loadActiveWorkspace();
await import(systemWorkspace.runtime.moduleUrl || WANIX_RUNTIME.moduleUrl);
const wanixSystem = createWanixSystem(systemWorkspace);
let systemReady = Boolean(wanixSystem?.isReady);
const terminalLayer = document.getElementById('terminal-layer');
const terminalSessions = new Map();
const workspaceTaskSessions = new Map();
const iframeSessions = new Map();
wanixSystem?.addEventListener('ready', (event) => {
  if (event.target !== wanixSystem) return;
  systemReady = true;
  for (const session of terminalSessions.values()) wakeTerminalSession(session);
  for (const session of workspaceTaskSessions.values()) wakeWorkspaceTaskSession(session);
});

function hideTerminalLayer() {
  terminalLayer?.classList.add('dragging');
}

document.addEventListener('dragstart', (event) => {
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}, true);

function hideTerminalLayerForTouch(event) {
  if (event.type === 'pointerdown' && event.pointerType !== 'touch') return;
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}

// Pointer drag targets sit below the persistent terminal layer. Hide it before
// the long-press drag begins so Home can be dropped onto a terminal pane too.
document.addEventListener('pointerdown', hideTerminalLayerForTouch, true);
document.addEventListener('touchstart', hideTerminalLayerForTouch, true);

function restoreTerminalLayer() {
  terminalLayer?.classList.remove('dragging');
}

// Dockview consumes the bubbling end/drop events while completing a native tab
// drag. Listen in capture phase so the preview state cannot get stuck hidden.
document.addEventListener('dragend', restoreTerminalLayer, true);
document.addEventListener('drop', restoreTerminalLayer, true);
document.addEventListener('pointerup', restoreTerminalLayer, true);
document.addEventListener('pointercancel', restoreTerminalLayer, true);
document.addEventListener('touchend', restoreTerminalLayer, true);
document.addEventListener('touchcancel', restoreTerminalLayer, true);
window.addEventListener('blur', restoreTerminalLayer);

function createTerminalSession(id, profile = getDefaultTerminalProfile()) {
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-session';
  const waitsForSystemReady = !systemReady;

  const task = document.createElement('wanix-task');
  task.id = `repl-${id}`;
  task.setAttribute('cmd', terminalCommand(profile) || DEFAULT_CMD);
  task.setAttribute('type', profile.type || 'gojs');
  task.setAttribute('env', buildEnv(profile.env));
  if (profile.wd) task.setAttribute('wd', profile.wd);
  task.setAttribute('term', '');
  task.setAttribute('start', '');
  task.setAttribute('for', 'wanix-system');

  const winchBind = document.createElement('wanix-bind');
  winchBind.setAttribute('dst', 'winch');
  winchBind.setAttribute('src', '#task/self/term/winch');
  task.appendChild(winchBind);

  const term = document.createElement('wanix-term');
  term.setAttribute('raw', '');
  term.setAttribute('no-scrollbar', '');
  term.setAttribute('path', `#task/repl-${id}/term`);
  term.setAttribute('for', 'wanix-system');

  wrapper.append(task, term);
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    task,
    term,
    anchor: null,
    layout: null,
    started: false,
    profile,
    waitsForSystemReady,
    autoActivates: '_connectStarted' in task,
  };
  terminalSessions.set(id, session);
  return session;
}

function getTerminalSession(id, profile) {
  return terminalSessions.get(id) || createTerminalSession(id, profile);
}

function destroyTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  terminalSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

function wakeTerminalSession(session) {
  if (!systemReady || session.started) return;
  session.started = true;
  // Current wanix-system emits `ready` to child elements created before the
  // system booted. Let that listener start the first shell. Elements created
  // after boot miss that event and need the explicit wake below. Newer Wanix
  // runtimes self-activate, so they never need it.
  if (session.waitsForSystemReady || session.autoActivates) return;
  queueMicrotask(() => {
    session.task._awake?.();
    session.term._awake?.();
  });
}

function layoutTerminalSession(session, anchor, isVisible) {
  if (!terminalLayer || !anchor || !isVisible) {
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return;
  }

  const nextLayout = {
    left: bounds.left - layerBounds.left,
    top: bounds.top - layerBounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  const previousLayout = session.layout;
  const layoutChanged = !previousLayout || Object.keys(nextLayout).some((key) =>
    Math.abs(nextLayout[key] - previousLayout[key]) >= 0.5
  );
  const sizeChanged = !previousLayout ||
    Math.abs(nextLayout.width - previousLayout.width) >= 0.5 ||
    Math.abs(nextLayout.height - previousLayout.height) >= 0.5;

  if (layoutChanged) {
    session.wrapper.style.left = `${nextLayout.left}px`;
    session.wrapper.style.top = `${nextLayout.top}px`;
    session.wrapper.style.width = `${nextLayout.width}px`;
    session.wrapper.style.height = `${nextLayout.height}px`;
    session.layout = nextLayout;
  }
  session.wrapper.classList.add('visible');
  if (sizeChanged) {
    requestAnimationFrame(() => {
      if (!session.wrapper.isConnected) return;
      session.term._fitAddon?.fit();
    });
  }
}

function focusTerminalSession(session, anchor, api, deferred = true) {
  const focus = () => {
    if (
      session.anchor !== anchor ||
      !api.isActive ||
      !session.wrapper.classList.contains('visible')
    ) return;
    session.term._term?.focus();
  };
  if (deferred) requestAnimationFrame(focus);
  else focus();
}

function attachOverlayTerminalSession(session, anchor, api) {
  let updateFrame = 0;

  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 && bounds.height > 0;
    layoutTerminalSession(session, anchor, isVisible);
    if (isVisible) {
      requestAnimationFrame(() => {
        const currentBounds = anchor.getBoundingClientRect();
        if (session.anchor === anchor && currentBounds.width > 0 && currentBounds.height > 0) {
          const needsFocusAfterWake = !session.started && api.isActive;
          wakeTerminalSession(session);
          if (needsFocusAfterWake) {
            requestAnimationFrame(() => focusTerminalSession(session, anchor, api, false));
          }
        }
      });
    }
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  const focusFromTerminalInteraction = () => {
    if (!api.isActive) {
      api.setActive();
      focusTerminalSession(session, anchor, api);
      return;
    }
    focusTerminalSession(session, anchor, api, false);
  };
  session.wrapper.addEventListener('pointerdown', focusFromTerminalInteraction);
  session.wrapper.addEventListener('touchstart', focusFromTerminalInteraction, { passive: true });
  const subscriptions = [
    api.onDidDimensionsChange(scheduleUpdate),
    api.onDidActiveChange((event) => {
      scheduleUpdate();
      if (event.isActive) focusTerminalSession(session, anchor, api);
    }),
    api.onDidFocusChange((event) => {
      if (event.isFocused) focusTerminalSession(session, anchor, api);
    }),
    api.onDidVisibilityChange(scheduleUpdate),
    api.onDidLocationChange(scheduleUpdate),
    api.onDidGroupChange(scheduleUpdate),
  ];

  scheduleUpdate();
  if (api.isActive) focusTerminalSession(session, anchor, api);

  return () => {
    observer.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
    session.wrapper.removeEventListener('pointerdown', focusFromTerminalInteraction);
    session.wrapper.removeEventListener('touchstart', focusFromTerminalInteraction);
    for (const subscription of subscriptions) subscription.dispose();
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutTerminalSession(session, null, false);
    }
  };
}

function attachTerminalSession(id, profile, anchor, api) {
  return attachOverlayTerminalSession(getTerminalSession(id, profile), anchor, api);
}

function createBindElement(bind) {
  const element = document.createElement('wanix-bind');
  element.setAttribute('dst', bind.dst);
  element.setAttribute('type', bind.type);
  element.setAttribute('perm', bind.perm);
  element.setAttribute('union', bind.union);
  if (bind.src) element.setAttribute('src', bind.src);
  if (bind.content) element.textContent = bind.content;
  return element;
}

function taskEnvironment(env) {
  return env.split('\n').map((line) => line.trim()).filter(Boolean).join(' ');
}

function createWorkspaceTaskSession(id, taskDefinition, workspace) {
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-session';

  const task = document.createElement('wanix-task');
  task.id = `workspace-task-${id}`;
  task.setAttribute('cmd', taskDefinition.cmd);
  task.setAttribute('type', taskDefinition.type);
  task.setAttribute('start', '');
  task.setAttribute('for', 'wanix-system');
  if (taskDefinition.wd) task.setAttribute('wd', taskDefinition.wd);
  if (taskDefinition.env.trim()) task.setAttribute('env', taskEnvironment(taskDefinition.env));
  if (taskDefinition.term) task.setAttribute('term', '');
  for (const bind of workspace.binds) task.appendChild(createBindElement(bind));

  let term = null;
  if (taskDefinition.term) {
    const winchBind = document.createElement('wanix-bind');
    winchBind.setAttribute('dst', 'winch');
    winchBind.setAttribute('src', '#task/self/term/winch');
    task.appendChild(winchBind);

    term = document.createElement('wanix-term');
    term.setAttribute('raw', '');
    term.setAttribute('no-scrollbar', '');
    term.setAttribute('path', `#task/${task.id}/term`);
    term.setAttribute('for', 'wanix-system');
    wrapper.append(task, term);
  } else {
    wrapper.append(task);
  }
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    task,
    term,
    anchor: null,
    layout: null,
    started: false,
    taskDefinition,
    error: null,
  };
  task.addEventListener('error', (event) => {
    setWorkspaceTaskStatus(session, 'failed', event.detail?.error || event.detail || event);
  });
  workspaceTaskSessions.set(id, session);
  return session;
}

function getWorkspaceTaskSession(id, taskDefinition, workspace) {
  return workspaceTaskSessions.get(id) || createWorkspaceTaskSession(id, taskDefinition, workspace);
}

function destroyWorkspaceTaskSession(id) {
  const session = workspaceTaskSessions.get(id);
  if (!session) return;
  workspaceTaskSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

function setWorkspaceTaskStatus(session, status, error = null) {
  session.status = status;
  session.error = error;
  session.task.dispatchEvent(new CustomEvent(WORKSPACE_TASK_STATUS_EVENT, {
    detail: { status, error },
  }));
}

function wakeWorkspaceTaskSession(session) {
  if (!systemReady || session.started) return;
  session.started = true;
  queueMicrotask(async () => {
    try {
      setWorkspaceTaskStatus(session, 'starting');
      await session.task._awake?.();
      await session.term?._awake?.();
      setWorkspaceTaskStatus(session, 'running');
    } catch (error) {
      setWorkspaceTaskStatus(session, 'failed', error);
      console.error('Workspace task failed to start', error);
    }
  });
}

function attachWorkspaceTaskSession(id, taskDefinition, workspace, anchor, api) {
  const session = getWorkspaceTaskSession(id, taskDefinition, workspace);
  if (!session.term) {
    wakeWorkspaceTaskSession(session);
    return () => {};
  }
  return attachOverlayTerminalSession(session, anchor, api);
}

const DEFAULT_IFRAME_ALLOW = 'clipboard-read; clipboard-write';

function createIframeSession(id, { src, title, allow = DEFAULT_IFRAME_ALLOW, allowFullscreen = false }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'iframe-session';

  const iframe = document.createElement('iframe');
  iframe.className = 'iframe-panel';
  iframe.src = src;
  iframe.title = title;
  iframe.allow = allow;
  iframe.allowFullscreen = allowFullscreen;

  wrapper.appendChild(iframe);
  terminalLayer?.appendChild(wrapper);

  const session = { id, wrapper, iframe, anchor: null, layout: null };
  iframeSessions.set(id, session);
  return session;
}

function getIframeSession(id, params) {
  const session = iframeSessions.get(id);
  if (session) {
    if (params.title) session.iframe.title = params.title;
    if (params.allow) session.iframe.allow = params.allow;
    session.iframe.allowFullscreen = !!params.allowFullscreen;
    return session;
  }
  return createIframeSession(id, params);
}

function destroyIframeSession(id) {
  const session = iframeSessions.get(id);
  if (!session) return;
  iframeSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

function layoutIframeSession(session, anchor, isVisible) {
  if (!terminalLayer || !anchor || !isVisible) {
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return;
  }

  const nextLayout = {
    left: bounds.left - layerBounds.left,
    top: bounds.top - layerBounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  const previousLayout = session.layout;
  const layoutChanged = !previousLayout || Object.keys(nextLayout).some((key) =>
    Math.abs(nextLayout[key] - previousLayout[key]) >= 0.5
  );

  if (layoutChanged) {
    session.wrapper.style.left = `${nextLayout.left}px`;
    session.wrapper.style.top = `${nextLayout.top}px`;
    session.wrapper.style.width = `${nextLayout.width}px`;
    session.wrapper.style.height = `${nextLayout.height}px`;
    session.layout = nextLayout;
  }
  session.wrapper.classList.add('visible');
}

function attachIframeSession(id, params, anchor, api) {
  const session = getIframeSession(id, params);
  let updateFrame = 0;

  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 && bounds.height > 0;
    layoutIframeSession(session, anchor, isVisible);
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  const subscriptions = [
    api.onDidDimensionsChange(scheduleUpdate),
    api.onDidVisibilityChange(scheduleUpdate),
    api.onDidLocationChange(scheduleUpdate),
    api.onDidGroupChange(scheduleUpdate),
  ];

  scheduleUpdate();

  return () => {
    observer.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
    for (const subscription of subscriptions) subscription.dispose();
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutIframeSession(session, null, false);
    }
  };
}

// --- Reveal.js ---
const revealStates = new WeakMap();
let slidesMarkdownPromise = null;

function loadSlidesMarkdown() {
  if (!slidesMarkdownPromise) {
    slidesMarkdownPromise = fetch('slides.md').then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load slides.md (${response.status})`);
      return response.text();
    });
  }
  return slidesMarkdownPromise;
}

function layoutReveal(homeContent) {
  revealStates.get(homeContent)?.deck?.layout();
}

async function prepareRevealSlides(homeContent) {
  const placeholder = homeContent.querySelector('[data-home-slides-markdown]');
  if (!placeholder) return;

  const stack = document.createElement('section');
  for (const source of (await loadSlidesMarkdown()).split(/^\s*--\s*$/m)) {
    const slide = document.createElement('section');
    slide.innerHTML = marked.parse(source);
    stack.appendChild(slide);
  }
  placeholder.replaceWith(stack);
}

function initReveal(homeContent, api) {
  const existing = revealStates.get(homeContent);
  if (existing) return existing;

  const state = { deck: null, destroyed: false };
  revealStates.set(homeContent, state);
  state.ready = (async () => {
    while (typeof Reveal === 'undefined') {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (state.destroyed) return;
    }
    await prepareRevealSlides(homeContent);
    if (state.destroyed) return;

    const el = homeContent.querySelector('.reveal');
    if (!el) return;
    state.deck = new Reveal(el, {
      hash: false,
      controls: true,
      progress: true,
      center: true,
      transition: 'slide',
      backgroundTransition: 'fade',
      keyboard: true,
      keyboardCondition: () => api.isActive &&
        !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName),
      overview: true,
      touch: true,
      mouseWheel: true,
      // Reveal switches to its scroll reader below 435px by default. That
      // mode disables navigation controls, including the custom arrows.
      scrollActivationWidth: null,
    });
    await state.deck.initialize();
    if (state.destroyed) return;
    layoutReveal(homeContent);
  })().catch((error) => {
    if (!state.destroyed) reportHomeError('Reveal initialization failed', error);
  });
  return state;
}

function destroyReveal(homeContent) {
  const state = revealStates.get(homeContent);
  if (!state) return;
  state.destroyed = true;
  state.deck?.destroy();
  revealStates.delete(homeContent);
}

// --- Settings forms ---
function setupConfigForm(settingsContent) {
  const startupEls = [...settingsContent.querySelectorAll('[data-config-startup]')];
  const restoreTabsEl = settingsContent.querySelector('[data-config="restore-tabs"]');
  const saveButton = settingsContent.querySelector('[data-config-action="save"]');
  const resetButton = settingsContent.querySelector('[data-config-action="reset"]');
  if (!saveButton || !resetButton) return;

  const populate = () => {
    const cfg = loadConfig();
    for (const input of startupEls) input.checked = cfg.startupPanels.includes(input.value);
    if (restoreTabsEl) restoreTabsEl.checked = cfg.restoreTabs;
  };
  populate();

  saveButton.addEventListener('click', () => {
    const config = loadConfig();
    saveConfig({
      ...config,
      startupPanels: startupEls.filter((input) => input.checked).map((input) => input.value),
      restoreTabs: restoreTabsEl?.checked === true,
    });
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = 'Saved!';
    s.style.color = '#3fb950';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  resetButton.addEventListener('click', () => {
    const c = resetConfig();
    for (const input of startupEls) input.checked = c.startupPanels.includes(input.value);
    if (restoreTabsEl) restoreTabsEl.checked = c.restoreTabs;
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = 'Reset to defaults.';
    s.style.color = '#8b949e';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  window.addEventListener(WORKSPACE_CHANGED_EVENT, populate);
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, populate);
}

function setupTerminalProfileForm(settingsContent) {
  const list = settingsContent.querySelector('[data-terminal-profile-list]');
  const nameEl = settingsContent.querySelector('[data-terminal-profile="name"]');
  const programEl = settingsContent.querySelector('[data-terminal-profile="program"]');
  const argsEl = settingsContent.querySelector('[data-terminal-profile="args"]');
  const typeEl = settingsContent.querySelector('[data-terminal-profile="type"]');
  const wdEl = settingsContent.querySelector('[data-terminal-profile="wd"]');
  const envEl = settingsContent.querySelector('[data-terminal-profile="env"]');
  const status = settingsContent.querySelector('[data-terminal-profile="status"]');
  const addButton = settingsContent.querySelector('[data-terminal-profile-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-terminal-profile-action="cancel"]');
  if (!list || !nameEl || !programEl || !argsEl || !typeEl || !wdEl || !envEl || !status || !addButton || !cancelButton) return;

  let editingProfileId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const render = () => {
    list.replaceChildren();
    const config = loadConfig();
    for (const profile of getTerminalProfiles(config)) {
      const item = document.createElement('div');
      item.className = 'terminal-profile-item';
      const details = document.createElement('div');
      const name = document.createElement('span');
      name.className = 'terminal-profile-name';
      name.textContent = profile.name;
      const meta = document.createElement('span');
      meta.className = 'terminal-profile-meta';
      meta.textContent = `${terminalCommand(profile)} · ${profile.type}${profile.id === 'hush' ? ' · shell defaults' : ''}`;
      details.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'terminal-profile-actions';
      const useDefault = document.createElement('button');
      useDefault.type = 'button';
      useDefault.textContent = config.defaultTerminalProfileId === profile.id ? 'Default' : 'Set default';
      useDefault.disabled = config.defaultTerminalProfileId === profile.id;
      useDefault.addEventListener('click', () => {
        saveTerminalProfiles(config.terminalProfiles, profile.id);
        setStatus(`${profile.name} is now the default terminal.`);
      });
      actions.appendChild(useDefault);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingProfileId = profile.id;
        nameEl.value = profile.name;
        programEl.value = profile.program;
        argsEl.value = profile.args;
        typeEl.value = profile.type;
        wdEl.value = profile.wd;
        envEl.value = profile.env;
        addButton.textContent = 'Save terminal preset';
        cancelButton.hidden = false;
        setStatus(`Editing ${profile.name}.`);
        nameEl.focus();
      });
      actions.appendChild(edit);
      if (!profile.builtin) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          if (editingProfileId === profile.id) resetFields();
          const profiles = config.terminalProfiles.filter((item) => item.id !== profile.id);
          saveTerminalProfiles(profiles, config.defaultTerminalProfileId === profile.id ? 'hush' : config.defaultTerminalProfileId);
          setStatus(`Removed ${profile.name}.`);
        });
        actions.appendChild(remove);
      }
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const resetFields = () => {
    editingProfileId = null;
    nameEl.value = '';
    programEl.value = '';
    argsEl.value = '';
    typeEl.value = 'gojs';
    wdEl.value = '';
    envEl.value = '';
    addButton.textContent = 'Add terminal preset';
    cancelButton.hidden = true;
  };
  addButton.addEventListener('click', () => {
    try {
      const profile = normalizeTerminalProfile({
        id: editingProfileId || undefined,
        name: nameEl.value,
        program: programEl.value,
        args: argsEl.value,
        type: typeEl.value,
        wd: wdEl.value,
        env: envEl.value,
      });
      if (!profile.program) throw new Error('A program is required.');
      const config = loadConfig();
      if (getTerminalProfiles(config).some((item) =>
        item.id !== editingProfileId && item.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase()
      )) {
        throw new Error('A terminal preset with this name already exists.');
      }
      const hasExistingProfile = config.terminalProfiles.some((item) => item.id === editingProfileId);
      const profiles = editingProfileId
        ? hasExistingProfile
          ? config.terminalProfiles.map((item) => item.id === editingProfileId ? profile : item)
          : [...config.terminalProfiles, profile]
        : [...config.terminalProfiles, profile];
      const action = editingProfileId ? 'Updated' : 'Added';
      saveTerminalProfiles(profiles, config.defaultTerminalProfileId);
      setStatus(`${action} ${profile.name}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || 'Unable to add terminal preset.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetFields();
    setStatus('Edit cancelled.');
  });
  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
}

function setupWorkspaceForm(settingsContent) {
  const activeSelect = settingsContent.querySelector('[data-workspace="active"]');
  const nameInput = settingsContent.querySelector('[data-workspace="name"]');
  const presetSelect = settingsContent.querySelector('[data-workspace="preset"]');
  const status = settingsContent.querySelector('[data-workspace="status"]');
  const jsonEl = settingsContent.querySelector('[data-workspace="json"]');
  const jsonStatus = settingsContent.querySelector('[data-workspace="json-status"]');
  const jsonFileInput = settingsContent.querySelector('[data-workspace="json-file"]');
  const deleteButton = settingsContent.querySelector('[data-workspace-action="delete"]');
  if (!activeSelect || !nameInput || !presetSelect || !status || !jsonEl || !jsonStatus || !jsonFileInput) return;

  let jsonDirty = false;
  let jsonWorkspaceId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const setJsonStatus = (message, isError = false) => {
    jsonStatus.textContent = message;
    jsonStatus.style.color = isError ? '#f85149' : '#8b949e';
  };
  const validateJson = () => {
    try {
      const workspace = parseWorkspaceJson(jsonEl.value);
      setJsonStatus(`${workspace.name} · v${workspace.version} · ${workspace.system.binds.length} system mounts · ${workspace.binds.length} mounts · ${workspace.tasks.length} tasks`);
      return workspace;
    } catch (error) {
      setJsonStatus(error.message || 'Workspace JSON is invalid.', true);
      return null;
    }
  };
  const loadCurrentJson = () => {
    const workspace = loadActiveWorkspace();
    jsonEl.value = JSON.stringify(workspace, null, 2);
    jsonWorkspaceId = workspace.id;
    jsonDirty = false;
    validateJson();
  };
  const addOption = (select, value, label, selected) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
  };
  const render = () => {
    const activeId = getActiveWorkspaceId();
    activeSelect.replaceChildren();
    for (const workspace of ensureWorkspaceStore()) {
      addOption(activeSelect, workspace.id, workspace.name, workspace.id === activeId);
    }
    const workspace = loadActiveWorkspace();
    nameInput.value = workspace.name;
    if (!jsonDirty || jsonWorkspaceId !== workspace.id) loadCurrentJson();
    presetSelect.replaceChildren();
    for (const [id, preset] of Object.entries(WORKSPACE_PRESETS)) {
      addOption(presetSelect, id, preset.name, id === 'hush-shell');
    }
    if (deleteButton) {
      deleteButton.disabled = activeId === 'hush-shell' || activeSelect.options.length <= 1;
    }
  };

  activeSelect.addEventListener('change', () => {
    if (setActiveWorkspaceId(activeSelect.value)) setStatus('Workspace selected.');
    else setStatus('Unable to select this workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="rename"]').addEventListener('click', () => {
    try {
      const workspace = renameWorkspace(getActiveWorkspaceId(), nameInput.value);
      setStatus(`Renamed workspace to ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to rename workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="create"]').addEventListener('click', () => {
    const workspace = createWorkspaceFromPreset(presetSelect.value);
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to create workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="duplicate"]').addEventListener('click', () => {
    const workspace = duplicateWorkspace(getActiveWorkspaceId());
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to duplicate workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="delete"]').addEventListener('click', () => {
    const workspace = loadActiveWorkspace();
    if (!window.confirm(`Delete ${workspace.name}?`)) return;
    if (deleteWorkspace(workspace.id)) setStatus(`Deleted ${workspace.name}.`);
    else setStatus('The default workspace cannot be deleted.', true);
  });
  settingsContent.querySelector('[data-workspace-action="json-reset"]').addEventListener('click', () => {
    loadCurrentJson();
    setStatus('Loaded the saved workspace JSON.');
  });
  settingsContent.querySelector('[data-workspace-action="json-copy"]').addEventListener('click', async () => {
    if (!validateJson()) return;
    try {
      await navigator.clipboard.writeText(jsonEl.value);
      setStatus('Workspace JSON copied.');
    } catch {
      setStatus('Unable to copy. Select the JSON and copy it manually.', true);
      jsonEl.focus();
      jsonEl.select();
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-download"]').addEventListener('click', () => {
    const workspace = validateJson();
    if (!workspace) return;
    const blob = new Blob([jsonEl.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workspace'}.json`;
    download.click();
    URL.revokeObjectURL(url);
    setStatus('Workspace JSON downloaded.');
  });
  jsonEl.addEventListener('input', () => {
    jsonDirty = true;
    validateJson();
  });
  jsonFileInput.addEventListener('change', async () => {
    const [file] = jsonFileInput.files || [];
    if (!file) return;
    try {
      jsonEl.value = await file.text();
      jsonDirty = true;
      const workspace = validateJson();
      if (workspace) setStatus(`Loaded ${workspace.name}. Review it, then choose how to apply it.`);
    } catch (error) {
      setStatus(error.message || 'Unable to read workspace JSON.', true);
    } finally {
      jsonFileInput.value = '';
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-create"]').addEventListener('click', () => {
    try {
      const workspace = importWorkspace(jsonEl.value);
      jsonDirty = false;
      setStatus(`Created ${workspace.name} from JSON.`);
    } catch (error) {
      setStatus(error.message || 'Unable to create workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-replace"]').addEventListener('click', () => {
    const current = loadActiveWorkspace();
    if (!window.confirm(`Replace ${current.name} with the JSON in this editor?`)) return;
    try {
      const workspace = replaceActiveWorkspace(jsonEl.value);
      jsonDirty = false;
      setStatus(`Replaced the current workspace with ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to replace workspace.', true);
    }
  });

  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
}

function setupSystemForm(settingsContent) {
  const moduleEl = settingsContent.querySelector('[data-system="module"]');
  const wasmEl = settingsContent.querySelector('[data-system="wasm"]');
  const list = settingsContent.querySelector('[data-system-bind-list]');
  const typeEl = settingsContent.querySelector('[data-system-bind="type"]');
  const dstEl = settingsContent.querySelector('[data-system-bind="dst"]');
  const srcEl = settingsContent.querySelector('[data-system-bind="src"]');
  const contentEl = settingsContent.querySelector('[data-system-bind="content"]');
  const modeEl = settingsContent.querySelector('[data-system-bind="mode"]');
  const status = settingsContent.querySelector('[data-system="status"]');
  const saveButton = settingsContent.querySelector('[data-system-action="save"]');
  const restartButton = settingsContent.querySelector('[data-system-action="restart"]');
  const addButton = settingsContent.querySelector('[data-system-bind-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-system-bind-action="cancel"]');
  if (!moduleEl || !wasmEl || !list || !typeEl || !dstEl || !srcEl || !contentEl || !modeEl || !status || !saveButton || !restartButton || !addButton || !cancelButton) return;

  let editingBindId = null;
  let draggedBindId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const resetBindFields = () => {
    editingBindId = null;
    typeEl.value = 'ns';
    dstEl.value = '';
    srcEl.value = '';
    contentEl.value = '';
    modeEl.value = '';
    addButton.textContent = 'Add system mount';
    cancelButton.hidden = true;
  };
  const render = () => {
    const workspace = loadActiveWorkspace();
    moduleEl.value = workspace.runtime.moduleUrl || WANIX_RUNTIME.moduleUrl;
    wasmEl.value = workspace.runtime.wasmUrl || WANIX_RUNTIME.wasmUrl;
    list.replaceChildren();
    for (const bind of workspace.system.binds) {
      const item = document.createElement('div');
      item.className = 'bind-item';
      makeBindItemDraggable(item, bind, {
        list,
        getDraggedId: () => draggedBindId,
        setDraggedId: (id) => { draggedBindId = id; },
        reorder: reorderWorkspaceSystemBinds,
        onReordered: () => setStatus('System mount order saved. Restart to apply changes.'),
      });
      const details = document.createElement('div');
      const path = document.createElement('span');
      path.className = 'bind-item-path';
      path.textContent = `${bind.dst} ← ${bind.src || 'inline content'}`;
      path.title = path.textContent;
      const meta = document.createElement('span');
      meta.className = 'bind-item-meta';
      meta.textContent = `${bind.type}${bind.mode ? ` · ${bind.mode}` : ''}`;
      details.append(path, meta);
      const actions = document.createElement('div');
      actions.className = 'bind-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingBindId = bind.id;
        typeEl.value = bind.type;
        dstEl.value = bind.dst;
        srcEl.value = bind.src;
        contentEl.value = bind.content;
        modeEl.value = bind.mode;
        addButton.textContent = 'Save system mount';
        cancelButton.hidden = false;
        setStatus(`Editing ${bind.dst}. Save and restart to apply changes.`);
        dstEl.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (editingBindId === bind.id) resetBindFields();
        removeWorkspaceSystemBind(bind.id);
        setStatus(`Removed ${bind.dst}. Restart to apply changes.`);
      });
      actions.append(edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const saveSettings = () => {
    saveWorkspaceSystemSettings({ moduleUrl: moduleEl.value, wasmUrl: wasmEl.value });
    setStatus('System settings saved. Restart the playground to apply changes.');
  };

  saveButton.addEventListener('click', () => {
    try {
      saveSettings();
    } catch (error) {
      setStatus(error.message || 'Unable to save system settings.', true);
    }
  });
  restartButton.addEventListener('click', () => {
    try {
      saveSettings();
      window.location.reload();
    } catch (error) {
      setStatus(error.message || 'Unable to save system settings.', true);
    }
  });
  addButton.addEventListener('click', () => {
    try {
      const bind = {
        type: typeEl.value,
        dst: dstEl.value,
        src: srcEl.value,
        content: contentEl.value,
        mode: modeEl.value,
      };
      if (editingBindId) updateWorkspaceSystemBind(editingBindId, bind);
      else addWorkspaceSystemBind(bind);
      setStatus(`${editingBindId ? 'Updated' : 'Added'} ${dstEl.value.trim()}. Restart to apply changes.`);
      resetBindFields();
    } catch (error) {
      setStatus(error.message || 'Unable to save the system mount.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetBindFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
}

function setupBindForm(settingsContent) {
  const list = settingsContent.querySelector('[data-bind-list]');
  const typeEl = settingsContent.querySelector('[data-bind="type"]');
  const dstEl = settingsContent.querySelector('[data-bind="dst"]');
  const srcEl = settingsContent.querySelector('[data-bind="src"]');
  const contentEl = settingsContent.querySelector('[data-bind="content"]');
  const permEl = settingsContent.querySelector('[data-bind="perm"]');
  const status = settingsContent.querySelector('[data-bind="status"]');
  const addButton = settingsContent.querySelector('[data-bind-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-bind-action="cancel"]');
  if (!list || !typeEl || !dstEl || !srcEl || !contentEl || !permEl || !status || !addButton || !cancelButton) return;

  let editingBindId = null;
  let draggedBindId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const render = () => {
    list.replaceChildren();
    const workspace = loadActiveWorkspace();
    if (workspace.binds.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hint';
      empty.textContent = 'No mounts yet.';
      list.appendChild(empty);
      return;
    }
    for (const bind of workspace.binds) {
      const item = document.createElement('div');
      item.className = 'bind-item';
      makeBindItemDraggable(item, bind, {
        list,
        getDraggedId: () => draggedBindId,
        setDraggedId: (id) => { draggedBindId = id; },
        reorder: reorderWorkspaceBinds,
        onReordered: () => setStatus('Mount order saved.'),
      });
      const details = document.createElement('div');
      const path = document.createElement('span');
      path.className = 'bind-item-path';
      path.textContent = `${bind.dst} ← ${bind.src || 'inline content'}`;
      path.title = path.textContent;
      const meta = document.createElement('span');
      meta.className = 'bind-item-meta';
      meta.textContent = `${bind.type} · ${bind.perm}`;
      details.append(path, meta);
      const actions = document.createElement('div');
      actions.className = 'bind-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingBindId = bind.id;
        typeEl.value = bind.type;
        dstEl.value = bind.dst;
        srcEl.value = bind.src;
        contentEl.value = bind.content;
        permEl.value = bind.perm;
        addButton.textContent = 'Save mount';
        cancelButton.hidden = false;
        setStatus(`Editing ${bind.dst}.`);
        dstEl.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (editingBindId === bind.id) resetFields();
        removeWorkspaceBind(bind.id);
        setStatus(`Removed ${bind.dst}.`);
      });
      actions.append(edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const resetFields = () => {
    editingBindId = null;
    typeEl.value = 'ns';
    dstEl.value = '';
    srcEl.value = '';
    contentEl.value = '';
    permEl.value = '0644';
    addButton.textContent = 'Add mount';
    cancelButton.hidden = true;
  };

  addButton.addEventListener('click', () => {
    try {
      const values = {
        type: typeEl.value,
        dst: dstEl.value,
        src: srcEl.value,
        content: contentEl.value,
        perm: permEl.value,
      };
      const bind = editingBindId
        ? updateWorkspaceBind(editingBindId, values)
        : addWorkspaceBind(values);
      if (!bind) throw new Error('Unable to save the mount.');
      setStatus(`${editingBindId ? 'Updated' : 'Added'} ${dstEl.value.trim()}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || 'Unable to add mount.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
}

function setupTaskForm(settingsContent, containerApi) {
  const list = settingsContent.querySelector('[data-task-list]');
  const nameEl = settingsContent.querySelector('[data-task="name"]');
  const cmdEl = settingsContent.querySelector('[data-task="cmd"]');
  const typeEl = settingsContent.querySelector('[data-task="type"]');
  const wdEl = settingsContent.querySelector('[data-task="wd"]');
  const envEl = settingsContent.querySelector('[data-task="env"]');
  const termEl = settingsContent.querySelector('[data-task="term"]');
  const autoStartEl = settingsContent.querySelector('[data-task="auto-start"]');
  const status = settingsContent.querySelector('[data-task="status"]');
  const addButton = settingsContent.querySelector('[data-task-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-task-action="cancel"]');
  if (!list || !nameEl || !cmdEl || !typeEl || !wdEl || !envEl || !termEl || !autoStartEl || !status || !addButton || !cancelButton) return;

  let editingTaskId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const render = () => {
    list.replaceChildren();
    const workspace = loadActiveWorkspace();
    if (workspace.tasks.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hint';
      empty.textContent = 'No tasks yet.';
      list.appendChild(empty);
      return;
    }
    for (const task of workspace.tasks) {
      const item = document.createElement('div');
      item.className = 'task-item';
      const details = document.createElement('div');
      const name = document.createElement('span');
      name.className = 'task-item-name';
      name.textContent = task.name;
      name.title = task.cmd;
      const meta = document.createElement('span');
      meta.className = 'task-item-meta';
      meta.textContent = `${task.type} · ${task.term ? 'terminal' : 'headless'}${task.autoStart ? ' · auto-start' : ''} · ${task.cmd}`;
      meta.title = meta.textContent;
      details.append(name, meta);

      const actions = document.createElement('div');
      actions.className = 'task-item-actions';
      const run = document.createElement('button');
      run.type = 'button';
      run.textContent = 'Run';
      run.addEventListener('click', () => {
        if (!containerApi) {
          setStatus('The task host is not available.', true);
          return;
        }
        addWorkspaceTaskPanel(containerApi, task, workspace);
        setStatus(`Started ${task.name}.`);
      });
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingTaskId = task.id;
        nameEl.value = task.name;
        cmdEl.value = task.cmd;
        typeEl.value = task.type;
        wdEl.value = task.wd;
        envEl.value = task.env;
        termEl.checked = task.term;
        autoStartEl.checked = task.autoStart;
        addButton.textContent = 'Save task';
        cancelButton.hidden = false;
        setStatus(`Editing ${task.name}. Changes apply to future runs.`);
        nameEl.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (editingTaskId === task.id) resetFields();
        removeWorkspaceTask(task.id);
        setStatus(`Removed ${task.name}.`);
      });
      actions.append(run, edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const resetFields = () => {
    editingTaskId = null;
    nameEl.value = '';
    cmdEl.value = '';
    typeEl.value = 'auto';
    wdEl.value = '.';
    envEl.value = '';
    termEl.checked = true;
    autoStartEl.checked = false;
    addButton.textContent = 'Add task';
    cancelButton.hidden = true;
  };

  addButton.addEventListener('click', () => {
    try {
      const currentTask = editingTaskId
        ? loadActiveWorkspace().tasks.find((task) => task.id === editingTaskId)
        : null;
      const values = {
        name: nameEl.value.trim() || cmdEl.value.trim() || 'Task',
        cmd: cmdEl.value,
        type: typeEl.value,
        wd: wdEl.value,
        env: envEl.value,
        fsys: currentTask?.fsys || '',
        term: termEl.checked,
        autoStart: autoStartEl.checked,
      };
      const task = editingTaskId
        ? updateWorkspaceTask(editingTaskId, values)
        : addWorkspaceTask(values);
      if (!task) throw new Error('Unable to save the task.');
      setStatus(`${editingTaskId ? 'Updated' : 'Added'} ${task.name}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || 'Unable to add task.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
}

function addTerminalPanel(api, group, profile = getDefaultTerminalProfile()) {
  const id = ++terminalIdCounter;
  const panel = api.addPanel({
    id: `terminal-${id}`,
    component: 'terminal',
    params: { terminalId: id, panelType: 'terminal', profile: clone(profile) },
    title: `${profile.name || 'Terminal'} ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'terminal', profile: clone(profile) });
  panel.api.setActive();
}

let homeIdCounter = 0;
let groupIdCounter = 0;
let iframeIdCounter = 0;
let settingsIdCounter = 0;
let workspaceTaskPanelCounter = 0;
let fallbackIdCounter = 0;

function addHomePanel(api, group) {
  const id = ++homeIdCounter;
  const panel = api.addPanel({
    id: `home-${id}`,
    component: 'home',
    params: { homeId: id, panelType: 'home' },
    title: 'Home',
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'home' });
  panel.api.setActive();
  return panel;
}

function addSettingsPanel(api, group) {
  const id = ++settingsIdCounter;
  const panel = api.addPanel({
    id: `settings-${id}`,
    component: 'settings',
    params: { settingsId: id, panelType: 'settings' },
    title: 'Settings',
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'settings' });
  panel.api.setActive();
  return panel;
}

function addFallbackPanel(api, group) {
  const id = ++fallbackIdCounter;
  const panel = api.addPanel({
    id: `fallback-${id}`,
    component: 'fallback',
    params: { fallbackId: id, panelType: 'fallback' },
    title: 'No panels',
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'fallback' });
  panel.api.setActive();
  return panel;
}

function addWorkspaceTaskPanel(api, task, workspace = loadActiveWorkspace(), group) {
  const sessionId = ++workspaceTaskPanelCounter;
  const panel = api.addPanel({
    id: `workspace-task-${sessionId}`,
    component: 'task',
    params: {
      sessionId,
      task: clone(task),
      workspaceId: workspace.id,
      panelType: 'task',
    },
    title: task.name || task.cmd,
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'task', task: clone(task), workspaceId: workspace.id });
  panel.api.setActive();
  return panel;
}

function autoStartWorkspaceTasks(api) {
  const workspace = loadActiveWorkspace();
  for (const task of workspace.tasks) {
    if (task.autoStart) addWorkspaceTaskPanel(api, task, workspace);
  }
}

function addGroupPanel(api, group) {
  const id = ++groupIdCounter;
  const panel = api.addPanel({
    id: `group-${id}`,
    component: 'group',
    params: { groupId: id, panelType: 'group' },
    title: 'Group',
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: 'group' });
  panel.api.setActive();
  return panel;
}

function addIframePanel(api, config, group) {
  const id = ++iframeIdCounter;
  const panel = api.addPanel({
    id: `iframe-${id}`,
    component: 'iframe',
    params: { iframeId: id, panelType: config.panelType, ...config },
    title: config.title,
    ...(group && { position: { referenceGroup: group } }),
  });
  rememberOpenPanel(panel, { component: config.panelType });
  panel.api.setActive();
  return panel;
}

const IFRAME_PANEL_OPTIONS = {
  codigo: { title: 'Codigo', src: 'https://codigo.dev', panelType: 'codigo' },
  crush: { title: 'Crush', src: 'https://justwasm.github.io/crush/', panelType: 'crush' },
  rickroll: {
    title: 'Rick Roll',
    src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    panelType: 'rickroll',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowFullscreen: true,
  },
};

const PANEL_CREATION_OPTIONS = [
  { component: 'terminal', label: 'Terminal', icon: Terminal },
  { component: 'fallback', label: 'No panels', icon: CircleOff },
  { component: 'home', label: 'Home', icon: House },
  { component: 'settings', label: 'Settings', icon: Settings },
  { component: 'group', label: 'Group', icon: UsersRound },
  { component: 'codigo', label: 'Codigo', icon: Code2 },
  { component: 'crush', label: 'Crush', icon: Bot },
  { component: 'rickroll', label: 'Rick Roll', icon: Music2 },
];

const PANEL_ICONS = Object.fromEntries(
  PANEL_CREATION_OPTIONS.map(({ component, icon }) => [component, icon]),
);
PANEL_ICONS.task = Play;

function addPanelByComponent(api, component, group) {
  if (component === 'terminal') return addTerminalPanel(api, group);
  if (component === 'fallback') return addFallbackPanel(api, group);
  if (component === 'settings') return addSettingsPanel(api, group);
  if (component === 'group') return addGroupPanel(api, group);
  if (IFRAME_PANEL_OPTIONS[component]) return addIframePanel(api, IFRAME_PANEL_OPTIONS[component], group);
  return addHomePanel(api, group);
}

function restoreSavedPanels(api) {
  const panels = getSavedOpenPanels();
  for (const panel of panels) {
    if (panel.component === 'terminal') {
      addTerminalPanel(api, undefined, panel.profile || getDefaultTerminalProfile());
    } else if (panel.component === 'task' && panel.task) {
      addWorkspaceTaskPanel(api, panel.task, loadWorkspace(panel.workspaceId) || loadActiveWorkspace());
    } else {
      addPanelByComponent(api, panel.component);
    }
  }
  return panels.length > 0;
}

function whenWanixReady(callback) {
  const run = () => requestAnimationFrame(callback);
  if (systemReady) {
    run();
    return;
  }

  const onReady = (event) => {
    if (event.target !== wanixSystem) return;
    wanixSystem.removeEventListener('ready', onReady);
    run();
  };
  wanixSystem?.addEventListener('ready', onReady);
}

// ========== Components ==========

// Home panels each own a Reveal instance so they can be split and closed independently.
function HomePanel({ api }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const template = document.getElementById('home-template');
    const homeContent = template?.content.firstElementChild?.cloneNode(true);
    if (!wrapper || !homeContent) return;

    wrapper.appendChild(homeContent);
    const panelView = wrapper.closest('.dv-view');
    if (panelView) panelView.classList.add('home-view');
    // Reveal also emits a bubbling "ready" event. Keep it from waking wanix.
    const stopReadyEvent = (event) => event.stopPropagation();
    homeContent.addEventListener('ready', stopReadyEvent);
    const dismiss = homeContent.querySelector('.home-debug-dismiss');
    dismiss?.addEventListener('click', dismissHomeDebugErrors);
    showHomeDebugErrors();
    initReveal(homeContent, api);
    const layout = () => requestAnimationFrame(() => layoutReveal(homeContent));
    const subscriptions = [
      api.onDidDimensionsChange(layout),
      api.onDidVisibilityChange((event) => { if (event.isVisible) layout(); }),
      api.onDidLocationChange(layout),
      api.onDidGroupChange(layout),
    ];
    layout();

    return () => {
      homeContent.removeEventListener('ready', stopReadyEvent);
      dismiss?.removeEventListener('click', dismissHomeDebugErrors);
      if (panelView) panelView.classList.remove('home-view');
      for (const subscription of subscriptions) subscription.dispose();
      destroyReveal(homeContent);
      homeContent.remove();
    };
  }, [api]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

function SettingsPanel({ containerApi }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const template = document.getElementById('settings-template');
    const settingsContent = template?.content.firstElementChild?.cloneNode(true);
    if (!wrapper || !settingsContent) return;

    wrapper.appendChild(settingsContent);
    const disposeConfigForm = setupConfigForm(settingsContent);
    const disposeTerminalProfileForm = setupTerminalProfileForm(settingsContent);
    const disposeWorkspaceForm = setupWorkspaceForm(settingsContent);
    const disposeSystemForm = setupSystemForm(settingsContent);
    const disposeBindForm = setupBindForm(settingsContent);
    const disposeTaskForm = setupTaskForm(settingsContent, containerApi);
    return () => {
      disposeConfigForm?.();
      disposeTerminalProfileForm?.();
      disposeWorkspaceForm?.();
      disposeSystemForm?.();
      disposeBindForm?.();
      disposeTaskForm?.();
      settingsContent.remove();
    };
  }, []);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

function WorkspaceTaskPanel({ api, params }) {
  const wrapperRef = useRef(null);
  const hasTerminal = params.task.term;
  const [taskStatus, setTaskStatus] = useState({ status: 'created', error: null });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const workspace = loadWorkspace(params.workspaceId) || loadActiveWorkspace();
    const session = getWorkspaceTaskSession(params.sessionId, params.task, workspace);
    const updateStatus = (event) => setTaskStatus(event.detail);
    session.task.addEventListener(WORKSPACE_TASK_STATUS_EVENT, updateStatus);
    setTaskStatus({ status: session.status || 'created', error: session.error || null });
    const detach = attachWorkspaceTaskSession(params.sessionId, params.task, workspace, wrapper, api);
    return () => {
      session.task.removeEventListener(WORKSPACE_TASK_STATUS_EVENT, updateStatus);
      detach?.();
    };
  }, [api, params.sessionId]);

  if (!hasTerminal) {
    return React.createElement('div', { ref: wrapperRef, className: 'task-headless panel-content' },
      React.createElement('h2', null, params.task.name),
      React.createElement('p', null, taskStatus.status === 'failed'
        ? taskStatus.error?.message || 'Task failed to start.'
        : taskStatus.status === 'starting'
          ? 'Starting task…'
          : 'Task started without a terminal. Its output is available in the browser console.'),
      React.createElement('span', { className: `task-headless-status ${taskStatus.status}` }, taskStatus.status),
    );
  }
  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

// Terminal panel: creates wanix-task + wanix-term
function TerminalPanel({ api, params }) {
  const id = params.terminalId;
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return attachTerminalSession(id, params.profile, wrapper, api);
  }, [id, params.profile]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

function GroupPanel() {
  return React.createElement('div', { className: 'group-panel panel-content' },
    React.createElement('img', { src: 'group.png', alt: 'Gear Shell group' }),
  );
}

function IframePanel({ api, params }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return attachIframeSession(params.iframeId, params, wrapper, api);
  }, [api, params.iframeId]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

function PanelTab(props) {
  const Icon = PANEL_ICONS[props.params.panelType] || Terminal;
  return React.createElement('div', { className: 'panel-tab' },
    React.createElement(Icon, { className: 'panel-tab-icon', size: 14, 'aria-hidden': true }),
    React.createElement(DockviewDefaultTab, props),
  );
}

function TerminalLaunchPicker({ className, iconSize, inMenu = false, onLaunch }) {
  const [expanded, setExpanded] = useState(false);
  const defaultProfile = getDefaultTerminalProfile();
  const menuRole = inMenu ? 'menuitem' : undefined;

  return React.createElement('div', { className: `terminal-launch-picker ${className}` },
    React.createElement('div', { className: 'terminal-launch-row' },
      React.createElement('button', {
        className: 'terminal-launch-primary',
        type: 'button',
        role: menuRole,
        title: terminalCommand(defaultProfile),
        onClick: () => onLaunch(defaultProfile),
      },
      React.createElement(Terminal, { size: iconSize, 'aria-hidden': true }),
      React.createElement('span', null, 'Terminal'),
      ),
      React.createElement('button', {
        className: 'terminal-launch-toggle',
        type: 'button',
        'aria-label': expanded ? 'Hide terminal presets' : 'Show terminal presets',
        'aria-expanded': expanded,
        onClick: () => setExpanded((open) => !open),
      }, React.createElement(ChevronDown, {
        className: expanded ? 'terminal-launch-chevron open' : 'terminal-launch-chevron',
        size: 14,
        'aria-hidden': true,
      })),
    ),
    expanded && React.createElement('div', { className: 'terminal-launch-options', role: inMenu ? 'menu' : undefined },
      getTerminalProfiles().map((profile) =>
        React.createElement('button', {
          key: profile.id,
          type: 'button',
          role: menuRole,
          title: terminalCommand(profile),
          onClick: () => onLaunch(profile),
        },
        React.createElement(Terminal, { size: iconSize, 'aria-hidden': true }),
        React.createElement('span', null, profile.name),
        )
      ),
    ),
  );
}

// Compact header action: tap creates a terminal, long-press opens extensions.
function AddTerminalButton({ containerApi, group }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const controlRef = useRef(null);
  const pressTimer = useRef(null);
  const longPress = useRef(false);

  useEffect(() => {
    const groupView = controlRef.current?.closest('.dv-groupview');
    groupView?.classList.add('panel-action-host');
    return () => groupView?.classList.remove('panel-action-host');
  }, []);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const openMenu = () => {
    clearPressTimer();
    longPress.current = true;
    setMenuOpen(true);
  };

  const startPress = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    longPress.current = false;
    pressTimer.current = setTimeout(openMenu, 450);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event) => {
      if (!controlRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu, true);
    return () => document.removeEventListener('pointerdown', closeMenu, true);
  }, [menuOpen]);

  const createTerminal = (event) => {
    if (longPress.current) {
      event.preventDefault();
      longPress.current = false;
      return;
    }
    addTerminalPanel(containerApi, group);
  };

  return React.createElement('div', { ref: controlRef, className: 'panel-actions' },
    React.createElement('button', {
      className: 'panel-action-button',
      type: 'button',
      title: 'Add',
      'aria-label': 'Add panel',
      'aria-haspopup': 'menu',
      'aria-expanded': menuOpen,
      onPointerDown: startPress,
      onPointerUp: clearPressTimer,
      onPointerCancel: clearPressTimer,
      onPointerLeave: clearPressTimer,
      onContextMenu: (event) => { event.preventDefault(); openMenu(); },
      onClick: createTerminal,
    }, React.createElement(Plus, { size: 18, 'aria-hidden': true })),
    menuOpen && React.createElement('div', { className: 'panel-action-menu', role: 'menu' },
      React.createElement(TerminalLaunchPicker, {
        className: 'panel-action-terminal-launch',
        iconSize: 16,
        inMenu: true,
        onLaunch: (profile) => {
          setMenuOpen(false);
          addTerminalPanel(containerApi, group, profile);
        },
      }),
      PANEL_CREATION_OPTIONS.filter((option) => option.component !== 'terminal').map((option) =>
        React.createElement('button', {
          key: option.component,
          type: 'button',
          role: 'menuitem',
          onClick: () => {
            setMenuOpen(false);
            addPanelByComponent(containerApi, option.component, group);
          },
        },
        React.createElement(option.icon, { size: 16, 'aria-hidden': true }),
        React.createElement('span', null, option.label),
        )
      ),
    ),
  );
}

function FallbackPage({ containerApi, className }) {
  const addPanel = (component) => {
    if (!containerApi) return;
    addPanelByComponent(containerApi, component);
  };

  return React.createElement('div', { className },
    React.createElement('div', { className: 'empty-workspace-card' },
      React.createElement('p', null, 'No open panels'),
      React.createElement('div', { className: 'empty-workspace-actions' },
        React.createElement(TerminalLaunchPicker, {
          className: 'empty-terminal-launch',
          iconSize: 18,
          onLaunch: (profile) => containerApi && addTerminalPanel(containerApi, undefined, profile),
        }),
        PANEL_CREATION_OPTIONS.filter((option) => !['terminal', 'fallback'].includes(option.component)).map((option) =>
          React.createElement('button', {
            key: option.component,
            type: 'button',
            onClick: () => addPanel(option.component),
          },
          React.createElement(option.icon, { size: 18, 'aria-hidden': true }),
          React.createElement('span', null, option.label),
          )
        ),
      ),
    ),
  );
}

function FallbackPanel({ containerApi }) {
  return React.createElement(FallbackPage, { containerApi, className: 'fallback-panel panel-content' });
}

// Main application
function App() {
  const onReady = useCallback((event) => {
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);

    event.api.onDidRemovePanel((panel) => {
      const match = /^terminal-(\d+)$/.exec(panel.id);
      if (match) destroyTerminalSession(Number(match[1]));
      const iframeMatch = /^iframe-(\d+)$/.exec(panel.id);
      if (iframeMatch) destroyIframeSession(Number(iframeMatch[1]));
      const workspaceTaskMatch = /^workspace-task-(\d+)$/.exec(panel.id);
      if (workspaceTaskMatch) destroyWorkspaceTaskSession(Number(workspaceTaskMatch[1]));
      forgetOpenPanel(panel.id);
      requestAnimationFrame(() => {
        if (event.api.panels.length === 0) addFallbackPanel(event.api);
      });
    });

    const cfg = loadConfig();
    const restored = cfg.restoreTabs && restoreSavedPanels(event.api);
    if (!restored) {
      for (const component of cfg.startupPanels) addPanelByComponent(event.api, component);
    }
    if (event.api.panels.length === 0) addFallbackPanel(event.api);

    // Start configured processes only after Wanix is ready so they follow the
    // same allocation path as tasks opened from Settings. Restored task tabs
    // already represent the prior session, so do not create duplicates.
    whenWanixReady(() => {
      if (!restored) autoStartWorkspaceTasks(event.api);
    });
  }, []);

  return React.createElement(React.Fragment, null,
    React.createElement(DockviewReact, {
      className: 'dockview-theme-github-dark',
      onReady,
      components: {
        home: HomePanel,
        settings: SettingsPanel,
        fallback: FallbackPanel,
        task: WorkspaceTaskPanel,
        terminal: TerminalPanel,
        group: GroupPanel,
        iframe: IframePanel,
      },
      defaultTabComponent: PanelTab,
      rightHeaderActionsComponent: AddTerminalButton,
    }),
  );
}

// --- Mount React app ---
const rootEl = document.getElementById('app-root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(React.createElement(App));
}
