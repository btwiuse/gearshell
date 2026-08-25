import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewDefaultTab, DockviewReact } from 'dockview-react';
import { Activity, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Bot, Check, ChevronDown, Code2, Cpu, Dog, Download, Ellipsis, Eye, EyeOff, FileCode2, FilePlus2, FolderOpen, FolderPlus, Github, Globe2, GripVertical, House, Layers, LayoutDashboard, Monitor, Music2, Pencil, Play, Plus, RefreshCw, Rocket, Save, Settings, Terminal, Trash2, TreePine, Upload, UsersRound, X, Zap, icons as LucideIcons } from 'lucide-react';

import { addCrushRunnerPanel, CrushRunnerPanel, initCrushRunner, reserveCrushRunnerIds } from './crush-runner.js?v=20260812.20';
import { addLandingPanel, LandingPanel, initHome } from './home.js?v=20260812.20';
import { addSettingsPanel, SettingsPanel, initSettings, TerminalPresetIconPicker } from './settings.js?v=20260812.31';
import { addFilesPanel, FilesPanel, initFiles } from './files.js?v=20260812.26';
import { addRuntimePanel, RuntimePanel, initRuntime } from './runtime.js?v=20260812.28';
import { addDeckPanel, DeckPanel, initDeck } from './deck.js?v=20260812.29';
import { addFallbackPanel, FallbackPanel, initLauncher, AddTerminalButton } from './launcher.js?v=20260812.33';
import {
  addTerminalPanel as addTerminalPanelFromPanels, addWorkbenchPanel as addWorkbenchPanelFromPanels,
  addVmPanel as addVmPanelFromPanels, addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  addGroupPanel as addGroupPanelFromPanels, addIframePanel as addIframePanelFromPanels,
  addPanelByComponent as addPanelByComponentFromPanels,
  TerminalPanel as TerminalPanelFromPanels,
  GroupPanel as GroupPanelFromPanels,
  IframePanel as IframePanelFromPanels,
  WorkbenchPanel as WorkbenchPanelFromPanels,
  VmPanel as VmPanelFromPanels,
  WorkspaceTaskPanel as WorkspaceTaskPanelFromPanels,
  PanelTab,
  WagiDogPet as WagiDogPetFromPanels,
  initPanels, PANEL_ICONS,
} from './panels.js?v=20260812.32';

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
const USER = 'me';
const HUSH_ENV = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  CLICOLOR_FORCE: '1',
  WANIX,
  HOME,
  USER,
  PATH: `${HOME}/go/bin:${WANIX}:/bin`,
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
const LEGACY_DEFAULT_CMD = 'hush -rcfile /tmp/profile';
const DEFAULT_CMD = 'hush -rcfile /profile';
const DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench';
const LEGACY_DEFAULT_WORKBENCH_ASSETS_URL = 'https://wanix.dev/workbench';
const DEFAULT_VM_BACKEND_URL = 'https://cdn.jsdelivr.net/npm/wanix-extras@0.4.0-rc2/dist/v86.tgz';
const REDUNDANT_WISP_VM_BACKEND_URL = 'https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@85be99779bb8026bf3be64579b096c60b2c77c64/v86.tgz';
const DEFAULT_VM_LINUX_URL = 'https://cdn.jsdelivr.net/npm/wanix-extras@0.4.0-rc2/dist/wanix-linux.tgz';
const DEFAULT_COLLAPSED_LAUNCHER_ITEMS = ['deck', 'codigo', 'crush', 'rickroll'];
const DEFAULT_LAUNCHER_ITEM_ORDER = ['terminal', 'home', 'deck', 'workbench', 'vm', 'settings', 'files', 'runtime', 'group', 'browser', 'bonsai', 'codigo', 'crush', 'crush-runner', 'rickroll'];
const CONFIG_KEY = 'gear-shell-config';
const DEFAULT_CONFIG = {
  cmd: DEFAULT_CMD,
  env: '',
  startupPanels: ['home'],
  restoreTabs: false,
  workbenchAssetsUrl: DEFAULT_WORKBENCH_ASSETS_URL,
  vmBackendUrl: DEFAULT_VM_BACKEND_URL,
  vmLinuxUrl: DEFAULT_VM_LINUX_URL,
  vmMemory: '512M',
  vmNetworkMode: 'none',
  vmWispUrl: '',
  wagiDogEnabled: true,
  collapsedLauncherItems: DEFAULT_COLLAPSED_LAUNCHER_ITEMS,
  launcherOrder: DEFAULT_LAUNCHER_ITEM_ORDER,
};
const WORKSPACE_INDEX_KEY = 'gear-shell-workspace-index';
const WORKSPACE_ACTIVE_KEY = 'gear-shell-active-workspace';
const WORKSPACE_KEY_PREFIX = 'gear-shell-workspace:';
const WORKSPACE_PRESET_INDEX_KEY = 'gear-shell-workspace-preset-index';
const WORKSPACE_PRESET_KEY_PREFIX = 'gear-shell-workspace-preset:';
const WORKSPACE_SCHEMA_VERSION = 4;
const WORKSPACE_CHANGED_EVENT = 'gear-shell-workspace-change';
const WORKSPACE_TASK_STATUS_EVENT = 'gear-shell-task-status';
const SUPPORTED_BIND_TYPES = ['ns', 'file', 'fetch', 'archive', 'import'];
const SUPPORTED_SYSTEM_BIND_TYPES = ['ns', 'file', 'fetch', 'archive', 'import'];
const SUPPORTED_UNION_MODES = ['after', 'before'];
const SUPPORTED_TASK_TYPES = ['auto', 'gojs', 'wasi', 'js'];
const STARTUP_PANEL_TYPES = ['home', 'deck', 'terminal', 'workbench', 'vm', 'settings', 'files', 'runtime', 'group', 'browser', 'bonsai', 'codigo', 'crush', 'crush-runner', 'rickroll'];
const LAUNCHER_COLLAPSIBLE_PANEL_TYPES = STARTUP_PANEL_TYPES;
function lucideIconId(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').replace(/([a-zA-Z])(\d+)/g, '$1-$2').toLowerCase();
}

function lucideIconLabel(name) {
  return lucideIconId(name).replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Persist canonical Lucide ids rather than a hand-maintained shortlist. The
// legacy aliases keep existing workspace configurations working unchanged.
const LEGACY_TERMINAL_PRESET_ICON_NAMES = {
  terminal: 'Terminal', bot: 'Bot', code: 'Code2', play: 'Play', cpu: 'Cpu', activity: 'Activity',
  browser: 'Globe2', files: 'FolderOpen', home: 'House', layout: 'LayoutDashboard', monitor: 'Monitor',
  rocket: 'Rocket', 'file-code': 'FileCode2', 'file-plus': 'FilePlus2', 'folder-plus': 'FolderPlus',
  grip: 'GripVertical', music: 'Music2', pencil: 'Pencil', refresh: 'RefreshCw', save: 'Save',
  settings: 'Settings', trash: 'Trash2', tree: 'TreePine', upload: 'Upload', users: 'UsersRound', close: 'X',
};
const CANONICAL_LUCIDE_ICON_IDS = new Set(Object.keys(LucideIcons).map(lucideIconId));
const TERMINAL_PRESET_ICON_OPTIONS = [
  ...Object.entries(LucideIcons).map(([name, icon]) => ({ id: lucideIconId(name), label: lucideIconLabel(name), icon })),
  ...Object.entries(LEGACY_TERMINAL_PRESET_ICON_NAMES)
    .filter(([id]) => !CANONICAL_LUCIDE_ICON_IDS.has(id))
    .map(([id, name]) => ({ id, label: lucideIconLabel(name), icon: LucideIcons[name] })),
].filter((option, index, options) => option.icon && options.findIndex((candidate) => candidate.id === option.id) === index)
  .sort((left, right) => left.label.localeCompare(right.label));
const TERMINAL_PRESET_ICON_BY_ID = Object.fromEntries(
  TERMINAL_PRESET_ICON_OPTIONS.map((option) => [option.id, option]),
);

const BUILTIN_TERMINAL_PROFILES = [
  { id: 'hush', name: 'Hush', type: 'gojs', icon: 'terminal', builtin: true },
  { id: 'crush', name: 'Crush', program: 'crush', args: '', type: 'gojs', env: '', wd: '', icon: 'bot', builtin: true },
];

const WANIX_RUNTIME = {
  wasmUrl: 'https://w9y.up.railway.app/go/github.com/justwasm/wanix/wasm@v0.4.6',
  moduleUrl: 'https://cdn.jsdelivr.net/gh/justwasm/wanix@v0.4.6/dist/wanix.min.js',
};
const LEGACY_WANIX_RUNTIME_WASM_URLS = new Set([
  'https://w9y.up.railway.app/go/github.com/justwasm/wanix/wasm@v0.4.0',
]);
const LEGACY_WANIX_RUNTIME_MODULE_URLS = new Set([
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@976020821b1a7a09a13c6e8034a41686a69c12df/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@9ceae50b35558ddf8e9f3862fa3c4aa9e8b4097d/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@9446c661d2d4bf66885e9f7082def770c314ecb1/dist/wanix.min.js',
  // This short-lived build called a nonexistent Workbench layout API.
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@71206477ae506f807b9893a8deca09749d212542/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@72141cb09a97b9a6f61461e9587ed8879ab08af1/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@d433adbca2d80d93719be5e25f65be0ed8786556/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@4eead0d2b5461803f4dbe4022f98c0e5479d2a71/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@4541e4ca6d7a6c07dd2b0538cf27e1fe5335e1a4/dist/wanix.min.js',
  'https://cdn.jsdelivr.net/gh/justwasm/wanix@main/dist/wanix.min.js',
]);

const DEFAULT_SYSTEM_CONFIG = {
  binds: [
    { id: 'root', type: 'ns', dst: '.', src: '#ramfs/new' },
    { id: 'task', type: 'ns', dst: 'task', src: '#task' },
    { id: 'term', type: 'ns', dst: 'term', src: '#term' },
    { id: 'web', type: 'ns', dst: 'web', src: '#web' },
    { id: 'js', type: 'ns', dst: 'js', src: '#js' },
    { id: 'opfs', type: 'ns', dst: 'opfs', src: '#web/opfs', mode: '0755' },
    { id: 'tmp', type: 'ns', dst: 'tmp', src: '#ramfs/new' },
    { id: 'hush', type: 'fetch', dst: 'hush', src: 'https://w9y.up.railway.app/go/github.com/btwiuse/hush/cmd/hush@v0.5.6', mode: '0755' },
    { id: 'w9y', type: 'fetch', dst: 'w9y', src: 'https://w9y.up.railway.app/go/github.com/btwiuse/w9y/cmd/w9y@v0.0.5', mode: '0755' },
    {
      id: 'boot-profile',
      type: 'file',
      dst: 'profile',
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

function normalizePresetDescription(description) {
  return typeof description === 'string' ? description.trim() : '';
}

function normalizeCustomWorkspacePreset(preset = {}) {
  const template = preset.template && typeof preset.template === 'object' ? preset.template : preset;
  return {
    id: typeof preset.id === 'string' && preset.id ? preset.id : `custom-${createWorkspaceId()}`,
    name: normalizeWorkspaceName(preset.name) || 'Untitled preset',
    description: normalizePresetDescription(preset.description),
    createdAt: typeof preset.createdAt === 'string' ? preset.createdAt : new Date().toISOString(),
    updatedAt: typeof preset.updatedAt === 'string' ? preset.updatedAt : new Date().toISOString(),
    runtime: normalizeRuntimeConfig(template.runtime),
    system: normalizeSystemConfig(template.system),
    binds: Array.isArray(template.binds) ? template.binds.map(normalizeBind) : [],
    tasks: Array.isArray(template.tasks) ? template.tasks.map(normalizeTask) : [],
    shell: normalizeShellConfig(template.shell),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRuntimeConfig(runtime = {}) {
  const configured = runtime && typeof runtime === 'object' ? runtime : {};
  const wasmUrl = LEGACY_WANIX_RUNTIME_WASM_URLS.has(configured.wasmUrl)
    ? WANIX_RUNTIME.wasmUrl
    : configured.wasmUrl;
  const moduleUrl = LEGACY_WANIX_RUNTIME_MODULE_URLS.has(configured.moduleUrl)
    ? WANIX_RUNTIME.moduleUrl
    : configured.moduleUrl;
  return {
    ...WANIX_RUNTIME,
    ...configured,
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(moduleUrl ? { moduleUrl } : {}),
  };
}

function normalizeShellConfig(config) {
  const terminalProfiles = Array.isArray(config?.terminalProfiles)
    ? config.terminalProfiles
      .map(normalizeTerminalProfile)
      .map(migrateLegacyHushTerminalProfile)
      .filter((profile) => profile.program)
    : [];
  const crushRunnerPresets = Array.isArray(config?.crushRunnerPresets)
    ? config.crushRunnerPresets
      .map(normalizeCrushRunnerPreset)
      .filter((preset) => preset.program)
    : [];
  const normalized = {
    cmd: typeof config?.cmd === 'string' && config.cmd.trim() ? config.cmd.trim() : DEFAULT_CMD,
    env: typeof config?.env === 'string' ? config.env : '',
    startupPanels: Array.isArray(config?.startupPanels)
      ? [...new Set(config.startupPanels.filter((panel) => STARTUP_PANEL_TYPES.includes(panel)))]
      : [],
    restoreTabs: config?.restoreTabs === true,
    workbenchAssetsUrl: normalizeWorkbenchAssetsUrl(config?.workbenchAssetsUrl),
    vmBackendUrl: normalizeVmBackendUrl(config?.vmBackendUrl),
    vmLinuxUrl: normalizeIntegrationUrl(config?.vmLinuxUrl, DEFAULT_VM_LINUX_URL),
    vmMemory: normalizeVmMemory(config?.vmMemory),
    vmNetworkMode: normalizeVmNetworkMode(config?.vmNetworkMode),
    vmWispUrl: normalizeVmWispUrl(config?.vmWispUrl),
    wagiDogEnabled: config?.wagiDogEnabled !== false,
    collapsedLauncherItems: Array.isArray(config?.collapsedLauncherItems)
      ? [...new Set(config.collapsedLauncherItems.filter((component) => LAUNCHER_COLLAPSIBLE_PANEL_TYPES.includes(component)))]
      : [...DEFAULT_COLLAPSED_LAUNCHER_ITEMS],
    launcherOrder: normalizeLauncherOrder(config?.launcherOrder),
    terminalProfiles,
    terminalProfileOrder: normalizeTerminalProfileOrder(config?.terminalProfileOrder, terminalProfiles),
    defaultTerminalProfileId: typeof config?.defaultTerminalProfileId === 'string'
      ? config.defaultTerminalProfileId
      : 'hush',
    crushRunnerPresets,
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(config?.crushRunnerPresetOrder, crushRunnerPresets),
    crushRunnerActiveId: typeof config?.crushRunnerActiveId === 'string'
      ? config.crushRunnerActiveId
      : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  };
  if (normalized.cmd === LEGACY_DEFAULT_CMD) normalized.cmd = DEFAULT_CMD;
  return normalized;
}

// Built-in Crush Runner presets. These ship with the app and are always
// available alongside the user's saved customs; the order below is also
// the fallback render order when a workspace has no saved
// crushRunnerPresetOrder yet. The first entry (`crush`) keeps the
// legacy default id so existing workspaces that pinned
// crushRunnerActiveId === 'crush' keep resolving.
const BUILTIN_CRUSH_RUNNER_PRESETS = [
  {
    id: 'crush',
    name: 'Crush',
    icon: 'bot',
    program: 'crush',
    args: '',
    type: 'gojs',
    env: 'USER=me',
    wd: '/opfs/home',
    builtin: true,
  },
  {
    id: 'ox',
    name: 'Ox',
    icon: 'ghost',
    program: '/opfs/wanix/crush',
    args: '',
    type: 'gojs',
    env: 'USER=me\nPATH=/opfs/home/go/bin:/opfs/wanix',
    wd: '/opfs/home',
    builtin: true,
    crushrc: String.raw`AGW=https://agw.up.railway.app

provider add OpenRouter \
     --type openai-compat \
     --base-url "$AGW/api/v1" \
     --api-key "-" \
     --extra-header "Model" "stealth/ox-alpha"

model add OpenRouter/stealth/ox-alpha \
     --name "Stealth Ox Alpha" \
     --context-window 1000000 \
     --default-max-tokens 163840 \
     --can-reason true \
     --supports-images false

model large OpenRouter/stealth/ox-alpha --think
model small OpenRouter/stealth/ox-alpha --think

option ui transparent false`,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    icon: 'bot',
    program: '/opfs/wanix/crush',
    args: '',
    type: 'gojs',
    env: 'USER=me\nPATH=/opfs/home/go/bin:/opfs/wanix',
    wd: '/opfs/home',
    builtin: true,
    crushrc: String.raw`AGW=https://agw.up.railway.app

provider add minimax-china \
  --type anthropic \
  --base-url "$AGW/anthropic" \
  --api-key "-"

model small minimax-china/MiniMax-M3
model large minimax-china/MiniMax-M3

option ui transparent false
`,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'fish',
    program: '/opfs/wanix/crush',
    args: '',
    type: 'gojs',
    env: 'USER=me\nPATH=/opfs/home/go/bin:/opfs/wanix',
    wd: '/opfs/home',
    builtin: true,
    crushrc: String.raw`AGW=https://agw.up.railway.app

provider add deepseek \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small deepseek/deepseek-v4-flash
model large deepseek/deepseek-v4-flash

option ui transparent false
`,
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    icon: 'footprints',
    program: '/opfs/wanix/crush',
    args: '',
    type: 'gojs',
    env: 'USER=me\nPATH=/opfs/home/go/bin:/opfs/wanix',
    wd: '/opfs/home',
    builtin: true,
    crushrc: String.raw`AGW=https://agw.up.railway.app

provider add stepfun \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small stepfun/step-3.7-flash
model large stepfun/step-3.7-flash

option ui transparent false
`,
  },
  {
    id: 'all',
    name: 'All',
    icon: 'bot',
    program: '/opfs/wanix/crush',
    args: '',
    type: 'gojs',
    env: 'USER=me\nPATH=/opfs/home/go/bin:/opfs/wanix',
    wd: '/opfs/home',
    builtin: true,
    crushrc: String.raw`AGW=https://agw.up.railway.app

provider add deepseek \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

provider add stepfun \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

provider add minimax-china \
  --type anthropic \
  --base-url "$AGW/anthropic" \
  --api-key "-"

provider add OpenRouter \
     --type openai-compat \
     --base-url "$AGW/api/v1" \
     --api-key "-" \
     --extra-header "Model" "stealth/ox-alpha"

model add OpenRouter/stealth/ox-alpha \
     --name "Stealth Ox Alpha" \
     --context-window 1000000 \
     --default-max-tokens 163840 \
     --can-reason true \
     --supports-images false

model large OpenRouter/stealth/ox-alpha --think
model small OpenRouter/stealth/ox-alpha --think
model small deepseek/deepseek-v4-flash
model large deepseek/deepseek-v4-flash
model small stepfun/step-3.7-flash
model large stepfun/step-3.7-flash
model small minimax-china/MiniMax-M3
model large minimax-china/MiniMax-M3

option ui transparent false
`,
  },
];

const BUILTIN_CRUSH_RUNNER_PRESET_IDS = BUILTIN_CRUSH_RUNNER_PRESETS.map((preset) => preset.id);
const DEFAULT_CRUSH_RUNNER_ACTIVE_ID = BUILTIN_CRUSH_RUNNER_PRESET_IDS[0];

function normalizeCrushRunnerPreset(preset = {}) {
  const base = normalizeTerminalProfile(preset);
  return {
    ...base,
    crushrc: typeof preset.crushrc === 'string' ? preset.crushrc : '',
    builtin: preset.builtin === true,
  };
}

function getCrushRunnerPresets(config = loadConfig()) {
  // Build the live list of built-ins, then layer any user-saved
  // override with the matching id on top of each one. Empty-string
  // fields are treated as "user did not set this" so newly introduced
  // defaults (e.g. a new env= line on a builtin) reach existing
  // workspaces whose override still stores '' from before the field
  // existed. The legacy `crush` slot keeps merging into the first
  // builtin by id, so workspaces pinned to that id keep working.
  const builtins = BUILTIN_CRUSH_RUNNER_PRESETS.map((template) => {
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

function getActiveCrushRunnerPreset(config = loadConfig()) {
  const presets = getCrushRunnerPresets(config);
  return presets.find((preset) => preset.id === (config.crushRunnerActiveId || DEFAULT_CRUSH_RUNNER_ACTIVE_ID))
    || presets[0];
}

function saveCrushRunnerPresets(presets, activeId, order) {
  const config = loadConfig();
  saveConfig({
    ...config,
    crushRunnerPresets: presets.map((preset) => ({ ...preset, builtin: false })),
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(order, presets),
    crushRunnerActiveId: typeof activeId === 'string' && activeId ? activeId : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  });
}

function blankCrushRunnerPresetDraft() {
  return { name: '', icon: 'bot', program: 'crush', args: '', type: 'gojs', wd: '', env: '', crushrc: '' };
}

function normalizeTerminalProfileOrder(order, profiles = []) {
  const knownIds = [
    ...BUILTIN_TERMINAL_PROFILES.map((profile) => profile.id),
    ...BUILTIN_CRUSH_RUNNER_PRESET_IDS,
    ...profiles.map((profile) => profile.id),
  ];
  const known = new Set(knownIds);
  const requested = Array.isArray(order) ? order : [];
  const unique = [...new Set(requested.filter((id) => known.has(id)))];
  return [...unique, ...knownIds.filter((id) => !unique.includes(id))];
}

function normalizeLauncherOrder(order) {
  const requested = Array.isArray(order) ? order : [];
  const known = new Set(DEFAULT_LAUNCHER_ITEM_ORDER);
  const unique = [...new Set(requested.filter((component) => known.has(component)))];
  return [...unique, ...DEFAULT_LAUNCHER_ITEM_ORDER.filter((component) => !unique.includes(component))];
}

function normalizeIntegrationUrl(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().replace(/\/+$/, '');
}

function normalizeWorkbenchAssetsUrl(value) {
  const normalized = normalizeIntegrationUrl(value, DEFAULT_WORKBENCH_ASSETS_URL);
  // This was GearShell's former default. Migrate it to the bundled submodule;
  // any other value remains an intentional workspace-local override.
  return normalized === LEGACY_DEFAULT_WORKBENCH_ASSETS_URL
    ? DEFAULT_WORKBENCH_ASSETS_URL
    : normalized;
}

function normalizeVmBackendUrl(value) {
  const normalized = normalizeIntegrationUrl(value, DEFAULT_VM_BACKEND_URL);
  // The temporary custom archive duplicated v86's existing Wisp support.
  // Restore workspaces that inherited it to the maintained public archive.
  return normalized === REDUNDANT_WISP_VM_BACKEND_URL ? DEFAULT_VM_BACKEND_URL : normalized;
}

function normalizeVmMemory(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^\d+(?:[KMG])?$/i.test(normalized) ? normalized.toUpperCase() : '512M';
}

function normalizeVmNetworkMode(value) {
  return ['none', 'fetch', 'wisp'].includes(value) ? value : 'none';
}

function normalizeVmWispUrl(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  try {
    const { protocol } = new URL(normalized);
    return ['wisp:', 'wisps:'].includes(protocol) ? normalized : '';
  } catch {
    return '';
  }
}

function normalizeTerminalProfile(profile = {}) {
  const defaultIcon = profile.id === 'crush' ? 'bot' : 'terminal';
  return {
    id: typeof profile.id === 'string' && profile.id ? profile.id : createWorkspaceId(),
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Terminal',
    program: typeof profile.program === 'string' ? profile.program.trim() : '',
    args: typeof profile.args === 'string' ? profile.args.trim() : '',
    type: SUPPORTED_TASK_TYPES.includes(profile.type) ? profile.type : 'gojs',
    env: typeof profile.env === 'string' ? profile.env : '',
    wd: typeof profile.wd === 'string' ? profile.wd.trim() : '',
    icon: TERMINAL_PRESET_ICON_BY_ID[profile.icon] ? profile.icon : defaultIcon,
  };
}

function getTerminalPresetIcon(profile) {
  return TERMINAL_PRESET_ICON_BY_ID[profile?.icon]?.icon || Terminal;
}

function migrateLegacyHushTerminalProfile(profile) {
  if (profile.id !== 'hush' || profile.program !== 'hush' || profile.args !== '-rcfile /tmp/profile') {
    return profile;
  }
  return { ...profile, args: '-rcfile /profile' };
}

function normalizeBind(bind = {}) {
  return {
    id: typeof bind.id === 'string' && bind.id ? bind.id : createWorkspaceId(),
    type: SUPPORTED_BIND_TYPES.includes(bind.type) ? bind.type : 'file',
    dst: typeof bind.dst === 'string' ? bind.dst.trim() : '',
    src: typeof bind.src === 'string' ? bind.src.trim() : '',
    content: typeof bind.content === 'string' ? bind.content : '',
    perm: typeof bind.perm === 'string' && bind.perm ? bind.perm : '0644',
    union: SUPPORTED_UNION_MODES.includes(bind.union) ? bind.union : 'after',
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

const LEGACY_RAMFS_MOUNT_IDS = new Set(['root', 'tmp']);

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
    union: SUPPORTED_UNION_MODES.includes(bind.union) ? bind.union : 'after',
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
  for (const bind of binds) {
    if (bind.id === 'boot-profile' && bind.type === 'file' && bind.dst === 'tmp/profile') {
      bind.dst = 'profile';
    }
    if (bind.type === 'ns' && LEGACY_RAMFS_MOUNT_IDS.has(bind.id) && bind.src === '#ramfs') {
      bind.src = '#ramfs/new';
    }
  }
  return {
    binds,
    allowOrigins: typeof system?.allowOrigins === 'string' ? system.allowOrigins.trim().replace(/[\s,]+/g, ' ') : '',
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
  if ((bind.type === 'fetch' || bind.type === 'archive' || bind.type === 'import') && !bind.src) {
    return `${bind.type} mounts require a source URL.`;
  }
  if (!SUPPORTED_UNION_MODES.includes(bind.union)) return 'Union position must be before or after.';
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

function workspacePresetStorageKey(id) {
  return `${WORKSPACE_PRESET_KEY_PREFIX}${id}`;
}

function createWorkspaceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadWorkspacePresetIndex() {
  const index = readStoredJson(WORKSPACE_PRESET_INDEX_KEY, []);
  return Array.isArray(index) ? index : [];
}

function saveWorkspacePresetIndex(index) {
  return writeStoredJson(WORKSPACE_PRESET_INDEX_KEY, index);
}

function loadCustomWorkspacePreset(id) {
  if (typeof id !== 'string' || !id.startsWith('custom-')) return null;
  const preset = readStoredJson(workspacePresetStorageKey(id), null);
  return preset ? normalizeCustomWorkspacePreset(preset) : null;
}

function getWorkspacePreset(presetId) {
  return WORKSPACE_PRESETS[presetId] || loadCustomWorkspacePreset(presetId) || WORKSPACE_PRESETS.empty;
}

function listWorkspacePresets() {
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

function workspacePresetNameExists(name, excludedId = null) {
  const target = normalizeWorkspaceName(name).toLocaleLowerCase();
  return listWorkspacePresets().some((preset) =>
    preset.id !== excludedId && normalizeWorkspaceName(preset.name).toLocaleLowerCase() === target
  );
}

function uniqueWorkspacePresetName(baseName, excludedId = null) {
  const base = normalizeWorkspaceName(baseName) || 'Preset';
  if (!workspacePresetNameExists(base, excludedId)) return base;
  let index = 2;
  while (workspacePresetNameExists(`${base} ${index}`, excludedId)) index += 1;
  return `${base} ${index}`;
}

function workspacePresetTemplate(workspace) {
  return {
    runtime: clone(workspace.runtime),
    system: clone(workspace.system),
    binds: clone(workspace.binds),
    tasks: clone(workspace.tasks),
    shell: clone(workspace.shell),
  };
}

function saveCustomWorkspacePreset(id, { name, description, workspace } = {}) {
  const existing = id ? loadCustomWorkspacePreset(id) : null;
  if (id && !existing) throw new Error('Preset not found.');
  const nextName = normalizeWorkspaceName(name);
  if (!nextName) throw new Error('A preset name is required.');
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
    throw new Error('Unable to save the preset.');
  }
  const index = loadWorkspacePresetIndex();
  const entry = { id: preset.id, name: preset.name, description: preset.description, updatedAt: preset.updatedAt };
  const entryIndex = index.findIndex((item) => item.id === preset.id);
  if (entryIndex === -1) index.push(entry);
  else index[entryIndex] = entry;
  if (!saveWorkspacePresetIndex(index)) throw new Error('Unable to save the preset library.');
  notifyWorkspaceChange();
  return preset;
}

function removeCustomWorkspacePreset(id) {
  const preset = loadCustomWorkspacePreset(id);
  if (!preset) return false;
  const index = loadWorkspacePresetIndex().filter((entry) => entry.id !== id);
  if (!saveWorkspacePresetIndex(index)) return false;
  try { localStorage.removeItem(workspacePresetStorageKey(id)); } catch { return false; }
  notifyWorkspaceChange();
  return true;
}

function createWorkspace(presetId = 'hush-shell', overrides = {}) {
  const preset = getWorkspacePreset(presetId);
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
    runtime: normalizeRuntimeConfig({ ...clone(preset.runtime), ...overrides.runtime }),
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
  const preset = getWorkspacePreset(presetId);
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
  if ((bind.type === 'fetch' || bind.type === 'archive' || bind.type === 'import') && !bind.src) return `${bind.type} mounts require a source URL.`;
  if (bind.type === 'file' && !bind.src && !bind.content) return 'Provide a URL or inline file content.';
  if (!SUPPORTED_UNION_MODES.includes(bind.union)) return 'Union position must be before or after.';
  if (bind.mode && !/^[0-7]{3,4}$/.test(bind.mode)) return 'Permissions must be an octal mode such as 0644.';
  return null;
}

function updateWorkspaceSystem(mutator) {
  return updateActiveWorkspace((workspace) => {
    workspace.system = normalizeSystemConfig(workspace.system);
    mutator(workspace.system, workspace);
  });
}

function saveWorkspaceSystemSettings({ moduleUrl, wasmUrl, allowOrigins }) {
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

function setWagiDogEnabled(enabled) {
  saveConfig({ ...loadConfig(), wagiDogEnabled: enabled });
}

const openPanelSnapshots = new Map();
let dockviewApi = null;
// Read-only accessor for sub-modules that need the latest dockview root
// (e.g. home.js, which spawns new panels from the marketing CTAs).
function getDockviewApi() {
  return dockviewApi;
}

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

// Extract the numeric suffix from a CrushRunner panel id ("crush-runner-3"
// → 3). Used by restoreSavedPanels to feed the original id back into
// addCrushRunnerPanel so reloads keep the same numeric label on the
// Crush Runner tab. Returns undefined for legacy snapshots that did
// not record the panel id.
function parseCrushRunnerPanelId(panelId) {
  if (typeof panelId !== "string") return undefined;
  const match = /^crush-runner-(\d+)$/.exec(panelId);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
  const profiles = [
    ...builtins,
    ...config.terminalProfiles.filter((profile) => !builtinIds.has(profile.id)),
  ];
  const order = normalizeTerminalProfileOrder(config.terminalProfileOrder, profiles);
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...profiles].sort((left, right) => positions.get(left.id) - positions.get(right.id));
}

function getDefaultTerminalProfile(config = loadConfig()) {
  return getTerminalProfiles(config).find((profile) => profile.id === config.defaultTerminalProfileId)
    || getTerminalProfiles(config)[0];
}

function getWorkbenchPanelConfig(config = loadConfig()) {
  return { assetsUrl: config.workbenchAssetsUrl || DEFAULT_WORKBENCH_ASSETS_URL };
}

function getVmPanelConfig(config = loadConfig()) {
  const networkMode = normalizeVmNetworkMode(config.vmNetworkMode);
  const wispUrl = normalizeVmWispUrl(config.vmWispUrl);
  return {
    backendUrl: config.vmBackendUrl || DEFAULT_VM_BACKEND_URL,
    linuxUrl: config.vmLinuxUrl || DEFAULT_VM_LINUX_URL,
    memory: config.vmMemory || '512M',
    netdev: networkMode === 'fetch'
      ? 'user,type=virtio,relay_url=fetch'
      : networkMode === 'wisp' && wispUrl
        ? `user,type=virtio,relay_url=${wispUrl}`
        : '',
  };
}

function terminalCommand(profile) {
  return profile.cmd || [profile.program, profile.args].filter(Boolean).join(' ');
}

function saveTerminalProfiles(profiles, defaultProfileId, profileOrder) {
  const config = loadConfig();
  const normalizedProfiles = profiles.map(normalizeTerminalProfile);
  const hush = normalizedProfiles.find((profile) => profile.id === 'hush');
  saveConfig({
    ...config,
    terminalProfiles: normalizedProfiles,
    terminalProfileOrder: normalizeTerminalProfileOrder(
      profileOrder === undefined ? config.terminalProfileOrder : profileOrder,
      normalizedProfiles,
    ),
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
  if (bind.mode) element.setAttribute('perm', bind.mode);
  if (bind.union) element.setAttribute('union', bind.union);
  if (bind.content) element.textContent = bind.content;
  return element;
}

function createWanixSystem(workspace = loadActiveWorkspace()) {
  const host = document.getElementById('wanix-host');
  if (!host) throw new Error('Unable to find the Wanix host.');
  const system = document.createElement('wanix-namespace');
  system.id = 'wanix-system';
  system.setAttribute('wasm', workspace.runtime.wasmUrl || WANIX_RUNTIME.wasmUrl);
  if (workspace.system.allowOrigins) system.setAttribute('allow-origins', workspace.system.allowOrigins);

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
// Dockview isolates panel content from the Wanix namespace ancestor.
const systemWorkspace = loadActiveWorkspace();
await import(systemWorkspace.runtime.moduleUrl || WANIX_RUNTIME.moduleUrl);
const wanixSystem = createWanixSystem(systemWorkspace);
let systemReady = Boolean(wanixSystem?.isReady);
const terminalLayer = document.getElementById('terminal-layer');
const terminalSessions = new Map();
const workspaceTaskSessions = new Map();
const iframeSessions = new Map();
const vmSessions = new Map();
const workbenchSessions = new Map();
const vmDriverInstallations = new Map();
wanixSystem?.addEventListener('ready', (event) => {
  if (event.target !== wanixSystem) return;
  systemReady = true;
  for (const session of terminalSessions.values()) wakeTerminalSession(session);
  for (const session of workspaceTaskSessions.values()) wakeWorkspaceTaskSession(session);
});

function getWanixRoot() {
  if (!systemReady || !wanixSystem?.root) throw new Error('Wanix system is still starting.');
  return wanixSystem.root;
}

;

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

  // Per-task extra binds (any mix of ns/file/fetch/archive). Profiles use
  // this to attach a private file into the task namespace without having
  // to round-trip through the wanix kernel writeFile API. Bind `dst`
  // paths must be relative — wanix-bind rejects leading slashes — and
  // are mounted inside the task's own namespace.
  if (Array.isArray(profile.extraBinds)) {
    for (const bind of profile.extraBinds) {
      if (!bind || typeof bind.dst !== 'string' || !bind.dst) continue;
      const element = document.createElement('wanix-bind');
      element.setAttribute('dst', bind.dst);
      if (bind.type) element.setAttribute('type', bind.type);
      if (bind.src) element.setAttribute('src', bind.src);
      if (bind.mode) element.setAttribute('perm', bind.mode);
      if (bind.union) element.setAttribute('union', bind.union);
      if (typeof bind.content === 'string') element.textContent = bind.content;
      task.appendChild(element);
    }
  }

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
  // Current Wanix namespace emits `ready` to child elements created before the
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
  // The overlay wrapper is positioned inside the shared terminal-layer using
  // the anchor's viewport coordinates. Anything that scrolls between the
  // anchor and the layer shifts the anchor without firing ResizeObserver,
  // so without these listeners the overlay detaches whenever a panel
  // scrolls. Walk up the tree and subscribe to every scrollable ancestor
  // plus the window so both panel-internal and page-level scrolling are
  // covered.
  const scrollListeners = [];
  const trackScrollParent = (parent) => {
    if (!parent || parent === session.wrapper) return;
    const style = getComputedStyle(parent);
    const overflows = [style.overflow, style.overflowX, style.overflowY];
    if (overflows.some((value) => value === 'auto' || value === 'scroll' || value === 'overlay')) {
      parent.addEventListener('scroll', scheduleUpdate, { passive: true });
      scrollListeners.push(parent);
    }
  };
  let scrollParent = anchor.parentElement;
  while (scrollParent) {
    trackScrollParent(scrollParent);
    scrollParent = scrollParent.parentElement;
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  scrollListeners.push(window);
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
    for (const target of scrollListeners) {
      target.removeEventListener('scroll', scheduleUpdate);
    }
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
    return false;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return false;
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

  const wasVisible = session.wrapper.classList.contains('visible');
  if (layoutChanged) {
    session.wrapper.style.left = `${nextLayout.left}px`;
    session.wrapper.style.top = `${nextLayout.top}px`;
    session.wrapper.style.width = `${nextLayout.width}px`;
    session.wrapper.style.height = `${nextLayout.height}px`;
    session.layout = nextLayout;
  }
  session.wrapper.classList.add('visible');
  return layoutChanged || !wasVisible;
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
    for (const target of scrollListeners) {
      target.removeEventListener('scroll', scheduleUpdate);
    }
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutIframeSession(session, null, false);
    }
  };
}

function createOverlayAttachment(session, anchor, api) {
  let updateFrame = 0;
  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 && bounds.height > 0;
    const layoutChanged = layoutIframeSession(session, anchor, isVisible);
    // VS Code's embedded Workbench listens to the window resize event rather
    // than exposing a public layout API. Forward Dockview's coalesced pane
    // updates after the overlay has received its new dimensions.
    if (layoutChanged && session.workbench) window.dispatchEvent(new Event('resize'));
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
    for (const target of scrollListeners) {
      target.removeEventListener('scroll', scheduleUpdate);
    }
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutIframeSession(session, null, false);
    }
  };
}

function createWorkbenchSession(id, config) {
  const wrapper = document.createElement('div');
  wrapper.className = 'workbench-session';

  const workbench = document.createElement('wanix-workbench');
  workbench.setAttribute('for', 'wanix-system');
  workbench.setAttribute('assets', config.assetsUrl);
  workbench.setAttribute('term', '');
  // Hush consumes an interactive terminal stream, including control and
  // escape sequences. Let xterm forward each key instead of line-buffering.
  workbench.setAttribute('raw', '');
  workbench.setAttribute('sidebar', 'always');
  const profile = getDefaultTerminalProfile();
  const shell = document.createElement('wanix-task');
  shell.setAttribute('role', 'shell');
  shell.setAttribute('cmd', terminalCommand(profile) || DEFAULT_CMD);
  shell.setAttribute('type', profile.type || 'gojs');
  shell.setAttribute('env', buildEnv(profile.env));
  // Workbench creates the task through the task control filesystem instead
  // of a wanix-task element. Its runtime requires a concrete directory, while
  // a blank `dir` is interpreted as an invalid path.
  shell.setAttribute('wd', profile.wd || HOME);
  workbench.appendChild(shell);
  wrapper.appendChild(workbench);
  terminalLayer?.appendChild(wrapper);

  const session = { id, wrapper, workbench, anchor: null, layout: null };
  workbenchSessions.set(id, session);
  return session;
}

function getWorkbenchSession(id, config) {
  return workbenchSessions.get(id) || createWorkbenchSession(id, config);
}

function destroyWorkbenchSession(id) {
  const session = workbenchSessions.get(id);
  if (!session) return;
  workbenchSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

function attachWorkbenchSession(id, config, anchor, api) {
  return createOverlayAttachment(getWorkbenchSession(id, config), anchor, api);
}

function waitForWanixSystem() {
  if (systemReady && wanixSystem?._kernel) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = (event) => {
      if (event.target !== wanixSystem) return;
      wanixSystem.removeEventListener('ready', onReady);
      wanixSystem.removeEventListener('error', onError);
      resolve();
    };
    const onError = (event) => {
      wanixSystem?.removeEventListener('error', onError);
      reject(event.detail?.error || new Error('Wanix system failed to start.'));
    };
    wanixSystem?.addEventListener('ready', onReady);
    wanixSystem?.addEventListener('error', onError, { once: true });
  });
}

function ensureVmDriver(backendUrl) {
  const existing = vmDriverInstallations.get(backendUrl);
  if (existing) return existing;
  const install = (async () => {
    await waitForWanixSystem();
    const bind = createWanixBindElement({ type: 'archive', dst: '#vm/v86', src: backendUrl });
    const bindings = document.createElement('div');
    bindings.appendChild(bind);
    terminalLayer?.appendChild(bindings);
    try {
      await wanixSystem._kernel._setupNamespace('1', '', bindings.querySelectorAll(':scope > wanix-bind'));
    } finally {
      bindings.remove();
    }
  })();
  vmDriverInstallations.set(backendUrl, install);
  install.catch(() => vmDriverInstallations.delete(backendUrl));
  return install;
}

function createVmSession(id, config) {
  const wrapper = document.createElement('div');
  wrapper.className = 'vm-session';
  wrapper.textContent = 'Preparing VM…';
  terminalLayer?.appendChild(wrapper);

  const session = { id, wrapper, config, vm: null, term: null, anchor: null, layout: null, startPromise: null, destroyed: false };
  vmSessions.set(id, session);
  return session;
}

function getVmSession(id, config) {
  return vmSessions.get(id) || createVmSession(id, config);
}

function destroyVmSession(id) {
  const session = vmSessions.get(id);
  if (!session) return;
  vmSessions.delete(id);
  session.destroyed = true;
  session.anchor = null;
  const taskPath = session.vm?.task?.rid ? session.vm.task.path : null;
  if (taskPath && session.vm?._kernel) {
    session.vm._kernel.root.writeFile(`${taskPath}/ctl`, 'terminate').catch(() => {});
  }
  session.wrapper.remove();
}

function startVmSession(session) {
  if (session.startPromise) return session.startPromise;
  session.startPromise = ensureVmDriver(session.config.backendUrl).then(() => {
    if (session.destroyed) return;
    const vmId = `vm-panel-${session.id}`;
    const vm = document.createElement('wanix-vm');
    vm.setAttribute('for', 'wanix-system');
    vm.setAttribute('id', vmId);
    vm.setAttribute('export', 'ttyS0');
    vm.setAttribute('mem', session.config.memory);
    if (session.config.netdev) vm.setAttribute('netdev', session.config.netdev);
    vm.setAttribute('term', '');
    vm.setAttribute('start', '');
    vm.appendChild(createWanixBindElement({ type: 'archive', dst: '.', src: session.config.linuxUrl }));

    const term = document.createElement('wanix-term');
    term.setAttribute('for', 'wanix-system');
    term.setAttribute('path', `#vm/${vmId}/term`);
    term.setAttribute('raw', '');
    term.setAttribute('no-scrollbar', '');
    session.vm = vm;
    session.term = term;
    session.wrapper.replaceChildren(vm, term);
  }).catch((error) => {
    if (session.destroyed) return;
    console.error('VM driver setup failed', error);
    session.wrapper.textContent = `VM failed to start: ${error.message || error}`;
    session.wrapper.classList.add('vm-session-error');
  });
  return session.startPromise;
}

function attachVmSession(id, config, anchor, api) {
  const session = getVmSession(id, config);
  startVmSession(session);
  return createOverlayAttachment(session, anchor, api);
}

function blankTerminalPresetDraft() {
  return { name: '', icon: 'terminal', program: '', args: '', type: 'gojs', wd: '', env: '' };
}

let homeIdCounter = 0;
let groupIdCounter = 0;
let iframeIdCounter = 0;
let settingsIdCounter = 0;
let filesIdCounter = 0;
let runtimeIdCounter = 0;
let workbenchIdCounter = 0;
let vmIdCounter = 0;
let workspaceTaskPanelCounter = 0;
let fallbackIdCounter = 0;

function autoStartWorkspaceTasks(api) {
  const workspace = loadActiveWorkspace();
  for (const task of workspace.tasks) {
    if (task.autoStart) addWorkspaceTaskPanelFromPanels(api, task, workspace);
  }
}

const IFRAME_PANEL_OPTIONS = {
  browser: {
    title: 'Browser',
    src: '/browser/',
    panelType: 'browser',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    allowFullscreen: true,
  },
  bonsai: {
    title: 'Bonsai 27B',
    src: '/bonsai/',
    panelType: 'bonsai',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    allowFullscreen: true,
  },
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
  { component: 'fallback', label: 'Launcher', icon: Rocket },
  { component: 'home', label: 'Home', icon: House },
  { component: 'deck', label: 'Deck', icon: LayoutDashboard },
  { component: 'workbench', label: 'Workbench', icon: Monitor },
  { component: 'vm', label: 'VM', icon: Cpu },
  { component: 'settings', label: 'Settings', icon: Settings },
  { component: 'files', label: 'Files', icon: FolderOpen },
  { component: 'runtime', label: 'Runtime', icon: Activity },
  { component: 'group', label: 'Group', icon: UsersRound },
  { component: 'browser', label: 'Browser', icon: Globe2 },
  { component: 'bonsai', label: 'Bonsai 27B', icon: TreePine },
  { component: 'codigo', label: 'Codigo', icon: Code2 },
  { component: 'crush', label: 'Crush', icon: Bot },
  { component: 'crush-runner', label: 'Crush Runner', icon: Rocket },
  { component: 'rickroll', label: 'Rick Roll', icon: Music2 },
];

function restoreSavedPanels(api) {
  const panels = getSavedOpenPanels();
  // Make sure the Crush Runner id counter never collides with a
  // restored panel id. Legacy snapshots did not record panelId, so
  // lifting the counter past the largest id we can derive from any
  // stored panel id still protects against collisions when the user
  // opens a fresh Crush Runner panel after a reload.
  let maxCrushRunnerId = 0;
  for (const panel of panels) {
    if (panel.component !== "crush-runner") continue;
    const parsed = parseCrushRunnerPanelId(panel.panelId);
    if (Number.isFinite(parsed) && parsed > maxCrushRunnerId) {
      maxCrushRunnerId = parsed;
    }
  }
  reserveCrushRunnerIds(maxCrushRunnerId);
  for (const panel of panels) {
    if (panel.component === 'terminal') {
      addTerminalPanelFromPanels(api, undefined, panel.profile || getDefaultTerminalProfile());
    } else if (panel.component === 'workbench') {
      addWorkbenchPanelFromPanels(api, undefined, panel.config || getWorkbenchPanelConfig());
    } else if (panel.component === 'vm') {
      addVmPanelFromPanels(api, undefined, panel.config || getVmPanelConfig());
    } else if (panel.component === 'task' && panel.task) {
      addWorkspaceTaskPanelFromPanels(api, panel.task, loadWorkspace(panel.workspaceId) || loadActiveWorkspace());
    } else if (panel.component === 'crush-runner') {
      // Restore the original Crush Runner panel id so the tab title
      // ("Crush Runner N") and the linked terminal launch ids stay
      // stable across reloads; otherwise the module-level counter in
      // crush-runner.js would mint fresh numbers and the previous
      // session's panels would silently disappear or collide.
      const restoredId = parseCrushRunnerPanelId(panel.panelId);
      addPanelByComponentFromPanels(api, panel.component, undefined, { id: restoredId });
    } else {
      addPanelByComponentFromPanels(api, panel.component);
    }
  }
  // Each add* helper above calls setActive() on the newly added panel, so the
  // last-added panel ends up active. When we remembered which panel was active
  // before refresh, reactivate that one here so the user lands back where they
  // were rather than on the rightmost tab.
  const savedActiveIndex = loadActiveWorkspace().ui?.activeOpenPanelIndex;
  if (typeof savedActiveIndex === 'number'
      && savedActiveIndex >= 0
      && savedActiveIndex < api.panels.length) {
    api.panels[savedActiveIndex]?.api.setActive();
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

// Terminal panel: creates wanix-task + wanix-term
// Compact header action: tap creates a terminal, long-press opens extensions.
// Main application
function App() {
  const onReady = useCallback((event) => {
    dockviewApi = event.api;
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);

    event.api.onDidRemovePanel((panel) => {
      const match = /^terminal-(\d+)$/.exec(panel.id);
      if (match) destroyTerminalSession(Number(match[1]));
      const iframeMatch = /^iframe-(\d+)$/.exec(panel.id);
      if (iframeMatch) destroyIframeSession(Number(iframeMatch[1]));
      const workbenchMatch = /^workbench-(\d+)$/.exec(panel.id);
      if (workbenchMatch) destroyWorkbenchSession(Number(workbenchMatch[1]));
      const vmMatch = /^vm-(\d+)$/.exec(panel.id);
      if (vmMatch) destroyVmSession(Number(vmMatch[1]));
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
      for (const component of cfg.startupPanels) addPanelByComponentFromPanels(event.api, component);
    }
    if (event.api.panels.length === 0) addFallbackPanel(event.api);

    // Remember which panel is active so a future reload with Restore tabs can
    // reactivate the same tab instead of always landing on the last-added one.
    const dockviewRoot = event.api;
    event.api.onDidActivePanelChange((activeEvent) => {
      if (!activeEvent.panel) return;
      const idx = dockviewRoot.panels.findIndex((p) => p.id === activeEvent.panel.id);
      if (idx < 0) return;
      const workspace = loadActiveWorkspace();
      if (workspace.ui?.activeOpenPanelIndex === idx) return;
      workspace.ui = { ...workspace.ui, activeOpenPanelIndex: idx };
      saveWorkspace(workspace);
      updateWorkspaceIndex(workspace);
    });

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
        home: LandingPanel,
        deck: DeckPanel,
        settings: SettingsPanel,
        files: FilesPanel,
        runtime: RuntimePanel,
        workbench: WorkbenchPanelFromPanels,
        vm: VmPanelFromPanels,
        fallback: FallbackPanel,
        task: WorkspaceTaskPanelFromPanels,
        terminal: TerminalPanelFromPanels,
        group: GroupPanelFromPanels,
        iframe: IframePanelFromPanels,
        'crush-runner': CrushRunnerPanel,  // from ./crush-runner.js
      },
      defaultTabComponent: PanelTab,
      rightHeaderActionsComponent: AddTerminalButton,
    }),
    React.createElement(WagiDogPetFromPanels),
  );
}

// --- Mount React app ---
const rootEl = document.getElementById('app-root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(React.createElement(App));
}

// Initialise the Launcher submodule with the helpers it needs at
// runtime. The launcher panel reads the workspace config (so it can
// know which items are collapsed in the More menu), the
// panel-creation catalog (so it can render the right icon / label
// for each launcher button), the terminal profile catalog + helpers
// (so the Terminal launch picker can show the available profiles),
// and the dockview dispatch (so the launcher buttons can add new
// panels into the same group as the launcher).
initLauncher({
  WORKSPACE_CHANGED_EVENT,
  loadConfig,
  normalizeLauncherOrder,
  addPanelByComponent: addPanelByComponentFromPanels,
  addTerminalPanel: addTerminalPanelFromPanels,
  getTerminalProfiles,
  getTerminalPresetIcon,
  terminalCommand,
  PANEL_CREATION_OPTIONS,
  getDefaultTerminalProfile,
  saveConfig,
  resetConfig,
  setWagiDogEnabled,
  rememberOpenPanel,
});

// Initialise the Panels submodule with the deps its 15 atomic
// panels + 7 add*Panel dispatchers need. The dep list is the longest
// of any module because each panel type reads a different slice of
// app.js (overlay session attachers, the panel-creation catalog,
// the IFRAME panel options table, the WORKSPACE_*_EVENT constants,
// the per-type id counters, plus the workspace + config helpers).
initPanels({
  attachTerminalSession, attachWorkbenchSession, attachVmSession,
  attachWorkspaceTaskSession, attachIframeSession,
  loadActiveWorkspace, loadWorkspace, loadConfig, saveConfig, resetConfig,
  rememberOpenPanel, clone,
  IFRAME_PANEL_OPTIONS, PANEL_CREATION_OPTIONS,
  WORKSPACE_CHANGED_EVENT, WORKSPACE_TASK_STATUS_EVENT,
  getWorkspaceTaskSession, getTerminalPresetIcon,
  getVmPanelConfig, getWorkbenchPanelConfig,
  getDefaultTerminalProfile,
  // Cross-module add*Panel dispatchers so panels.js can route every
  // component name (home / deck / settings / files / runtime /
  // fallback / crush-runner) through a single PANEL_ADDERS table.
  addLandingPanel, addDeckPanel, addSettingsPanel, addFilesPanel,
  addRuntimePanel, addFallbackPanel, addCrushRunnerPanel,
});

// Initialise the Deck submodule with the helpers it needs at
// runtime. The deck panel only needs the debug-overlay helpers and
// the CDN-loaded Reveal + marked globals (passed through the dep
// shim so deck.js never reaches into the global scope directly).
initDeck({
  Reveal: typeof window !== 'undefined' ? window.Reveal : undefined,
  marked: typeof window !== 'undefined' ? window.marked : undefined,
  reportHomeError,
  dismissHomeDebugErrors,
  showHomeDebugErrors,
  rememberOpenPanel,
});

// Initialise the Runtime submodule with the helpers it needs at
// runtime. The panel reads wanix state (systemReady / getWanixRoot)
// plus the live terminal + task session Maps (kept in app.js since
// the TerminalPanel / WorkspaceTaskPanel also write to them).
initRuntime({
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  getWanixRoot,
  loadActiveWorkspace,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
  rememberOpenPanel,
});

// Initialise the Files submodule with the helpers it needs at
// runtime. The panel only reads the wanix filesystem root and
// subscribes to the wanix-system ready event; everything else is
// self-contained inside files.js.
initFiles({
  wanixSystem,
  getWanixRoot,
  rememberOpenPanel,
});

// Initialise the Settings submodule with the helpers it needs at
// runtime. Done at the bottom of the module so every helper defined
// above is available as a dependency. The shell calls the setup*Form
// helpers that wire each <details> section; setupConfigForm has
// already migrated into settings.js and is no longer passed as a dep.
// The remaining setup*Form helpers (workspace / preset / system /
// bind / task / terminal-profile) will migrate in follow-up commits.
initSettings({
  loadConfig,
  saveConfig,
  resetConfig,
  normalizeLauncherOrder,
  normalizeVmWispUrl,
  PANEL_CREATION_OPTIONS,
  WORKSPACE_CHANGED_EVENT,
  WANIX_RUNTIME,
  rememberOpenPanel,
  // Workspace / preset / system helpers
  createWorkspaceFromPreset,
  listWorkspacePresets,
  loadActiveWorkspace,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  importWorkspace,
  parseWorkspaceJson,
  renameWorkspace,
  replaceActiveWorkspace,
  setActiveWorkspaceId,
  addWorkspaceSystemBind,
  makeBindItemDraggable,
  removeWorkspaceSystemBind,
  reorderWorkspaceSystemBinds,
  saveWorkspaceSystemSettings,
  updateWorkspaceSystemBind,
  // Task + bind helpers (used by setupTaskForm and setupBindForm)
  addWorkspaceBind,
  addWorkspaceTask,
  addWorkspaceTaskPanel: addWorkspaceTaskPanelFromPanels,
  removeWorkspaceBind,
  removeWorkspaceTask,
  reorderWorkspaceBinds,
  updateWorkspaceBind,
  updateWorkspaceTask,
  // Terminal preset helpers (used by TerminalPresetEditor and the
  // Lucide icon picker that lives next to it)
  getTerminalProfiles,
  saveTerminalProfiles,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  blankTerminalPresetDraft,
  getTerminalPresetIcon,
  terminalCommand,
  TerminalPresetIconPicker,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
});

// Initialise the Home submodule with the helpers it needs at runtime.
// Done at the bottom of the module so every helper defined above is
// available as a dependency. Home only needs the dispatch function and
// a live view of the dockview root to fall back to when the panel is
// not given an explicit containerApi.
initHome({
  addPanelByComponent: addPanelByComponentFromPanels,
  getDockviewApi,
  rememberOpenPanel,
});

// Initialise the CrushRunner submodule with the helpers it needs at
// runtime. Done at the bottom of the module so every helper defined
// above is available as a dependency.
initCrushRunner({
  HOME,
  WANIX,
  createTerminalSession,
  attachOverlayTerminalSession,
  destroyTerminalSession,
  addTerminalPanel: addTerminalPanelFromPanels,
  waitForWanixSystem,
  getWanixRoot,
  buildEnv,
  getTerminalProfiles,
  loadConfig,
  saveTerminalProfiles,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  TerminalPresetIconPicker,
  getCrushRunnerPresets,
  getActiveCrushRunnerPreset,
  saveCrushRunnerPresets,
  normalizeCrushRunnerPreset,
  blankCrushRunnerPresetDraft,
  getTerminalPresetIcon,
  TERMINAL_PRESET_ICON_BY_ID,
  WORKSPACE_CHANGED_EVENT,
  rememberOpenPanel,
});
