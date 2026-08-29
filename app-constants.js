// App-wide constants and static data: shell env, default config, icon
// catalogs, built-in profiles, runtime URLs, system binds, and the
// built-in workspace presets. Pure data (500-line rule split).

import { icons as LucideIcons } from "lucide-react";

export const debugMode = window.location.search.includes("debug");
export let debugErrorsDismissed = false;

export function showHomeDebugErrors() {
  if (!debugMode || debugErrorsDismissed) return;
  const errors = window.homeDebugErrors || [];
  if (errors.length === 0) return;
  for (const homeContent of document.querySelectorAll(".home-content")) {
    const output = homeContent.querySelector(".home-debug-errors");
    const dismiss = homeContent.querySelector(".home-debug-dismiss");
    if (!output) continue;
    output.textContent = errors.slice(-3).join("\n\n");
    output.hidden = false;
    if (dismiss) dismiss.hidden = false;
  }
}

export function dismissHomeDebugErrors() {
  debugErrorsDismissed = true;
  for (const homeContent of document.querySelectorAll(".home-content")) {
    homeContent.querySelector(".home-debug-errors")?.setAttribute("hidden", "");
    homeContent.querySelector(".home-debug-dismiss")?.setAttribute(
      "hidden",
      "",
    );
  }
}

export function reportHomeError(context, error) {
  console.error(context, error);
  if (!debugMode) return;
  const details = (error && (error.stack || error.message)) || String(error);
  window.homeDebugErrors = window.homeDebugErrors || [];
  window.homeDebugErrors.push(`${context}: ${details}`);
  showHomeDebugErrors();
}

if (debugMode) {
  window.addEventListener(
    "error",
    () => requestAnimationFrame(showHomeDebugErrors),
  );
  window.addEventListener(
    "unhandledrejection",
    () => requestAnimationFrame(showHomeDebugErrors),
  );
}

// --- Constants ---
// dockview-enterprise license key. KeyId KEY-0001, ValidUntil 9999-12-31
// (valid for every released build; verified against the FNV-1a checksum).
export const DOCKVIEW_LICENSE_KEY =
  "[KeyId:KEY-0001][ValidUntil:31_Dec_9999]__e8c2755cb33df0c2";
export const WANIX = "/opfs/wanix";
export const HOME = "/opfs/home";
export const USER = "me";
export const AGW = "https://agw.up.railway.app";
export const BASH_ENV = {
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  CLICOLOR_FORCE: "1",
  WANIX,
  HOME,
  USER,
  AGW,
  PATH: `${HOME}/go/bin:${WANIX}:/bin`,
  GOPROXY: "https://goproxy.up.railway.app",
  GONOSUMDB: "*",
  CRUSH_CORE_UTILS: "1",
  DO_NOT_TRACK: "1",
  CRUSH_DISABLE_PROVIDER_AUTO_UPDATE: "1",
  TERM_WINCH: "/winch",
  LOCATION: window.location.pathname,
  GOMEMLIMIT: "384MiB",
  GOGC: "70",
};
export const LEGACY_DEFAULT_CMD = "hush -rcfile /tmp/profile";
export const DEFAULT_CMD = "bash -rcfile /preset/profile";
export const DEFAULT_WORKBENCH_ASSETS_URL = "/wanix-workbench";
export const LEGACY_DEFAULT_WORKBENCH_ASSETS_URL =
  "https://wanix.dev/workbench";
export const DEFAULT_VM_BACKEND_URL =
  "https://cdn.jsdelivr.net/npm/wanix-extras@0.4.0-rc2/dist/v86.tgz";
export const DEFAULT_VM_LINUX_URL =
  "https://cdn.jsdelivr.net/npm/wanix-extras@0.4.0-rc2/dist/wanix-linux.tgz";
export const DEFAULT_COLLAPSED_LAUNCHER_ITEMS = [
  "deck",
  "codigo",
  "crush",
  "rickroll",
];
export const DEFAULT_LAUNCHER_ITEM_ORDER = [
  "terminal",
  "home",
  "deck",
  "workbench",
  "vm",
  "settings",
  "files",
  "runtime",
  "playground",
  "music",
  "group",
  "browser",
  "bonsai",
  "codigo",
  "crush",
  "crush-runner",
  "rickroll",
];
export const CONFIG_KEY = "gear-shell-config";
export const DEFAULT_CONFIG = {
  cmd: DEFAULT_CMD,
  env: "",
  startupPanels: ["home"],
  restoreTabs: false,
  allowBackgroundPlayback: true,
  workbenchAssetsUrl: DEFAULT_WORKBENCH_ASSETS_URL,
  vmBackendUrl: DEFAULT_VM_BACKEND_URL,
  vmLinuxUrl: DEFAULT_VM_LINUX_URL,
  vmMemory: "512M",
  vmNetworkMode: "none",
  vmWispUrl: "",
  wagiDogEnabled: false,
  widgetbot: false,
  providers: [],
  collapsedLauncherItems: DEFAULT_COLLAPSED_LAUNCHER_ITEMS,
  launcherOrder: DEFAULT_LAUNCHER_ITEM_ORDER,
  pinnedLauncherItems: [],
};
export const WORKSPACE_INDEX_KEY = "gear-shell-workspace-index";
export const WORKSPACE_ACTIVE_KEY = "gear-shell-active-workspace";
export const WORKSPACE_KEY_PREFIX = "gear-shell-workspace:";
export const WORKSPACE_PRESET_INDEX_KEY = "gear-shell-workspace-preset-index";
export const WORKSPACE_PRESET_KEY_PREFIX = "gear-shell-workspace-preset:";
export const WORKSPACE_SCHEMA_VERSION = 4;
export const WORKSPACE_CHANGED_EVENT = "gear-shell-workspace-change";
export const WORKSPACE_TASK_STATUS_EVENT = "gear-shell-task-status";
export const SUPPORTED_BIND_TYPES = [
  "ns",
  "file",
  "fetch",
  "archive",
  "import",
];
export const SUPPORTED_SYSTEM_BIND_TYPES = [
  "ns",
  "file",
  "fetch",
  "archive",
  "import",
];
export const SUPPORTED_UNION_MODES = ["after", "before"];
export const SUPPORTED_TASK_TYPES = ["auto", "gojs", "wasi", "js"];
export const STARTUP_PANEL_TYPES = [
  "home",
  "deck",
  "terminal",
  "workbench",
  "vm",
  "settings",
  "files",
  "runtime",
  "playground",
  "group",
  "browser",
  "bonsai",
  "codigo",
  "crush",
  "crush-runner",
  "rickroll",
];
export const LAUNCHER_COLLAPSIBLE_PANEL_TYPES = STARTUP_PANEL_TYPES;
export function lucideIconId(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(
    /([A-Z])([A-Z][a-z])/g,
    "$1-$2",
  ).replace(/([a-zA-Z])(\d+)/g, "$1-$2").toLowerCase();
}

export function lucideIconLabel(name) {
  return lucideIconId(name).replace(/-/g, " ").replace(
    /\b\w/g,
    (letter) => letter.toUpperCase(),
  );
}

// Persist canonical Lucide ids rather than a hand-maintained shortlist. The
// legacy aliases keep existing workspace configurations working unchanged.
export const LEGACY_TERMINAL_PRESET_ICON_NAMES = {
  terminal: "Terminal",
  bot: "Bot",
  code: "Code2",
  play: "Play",
  cpu: "Cpu",
  activity: "Activity",
  browser: "Globe2",
  files: "FolderOpen",
  home: "House",
  layout: "LayoutDashboard",
  monitor: "Monitor",
  rocket: "Rocket",
  "file-code": "FileCode2",
  "file-plus": "FilePlus2",
  "folder-plus": "FolderPlus",
  grip: "GripVertical",
  music: "Music2",
  pencil: "Pencil",
  refresh: "RefreshCw",
  save: "Save",
  settings: "Settings",
  trash: "Trash2",
  tree: "TreePine",
  upload: "Upload",
  users: "UsersRound",
  close: "X",
};
export const CANONICAL_LUCIDE_ICON_IDS = new Set(
  Object.keys(LucideIcons).map(lucideIconId),
);
export const TERMINAL_PRESET_ICON_OPTIONS = [
  ...Object.entries(LucideIcons).map(([name, icon]) => ({
    id: lucideIconId(name),
    label: lucideIconLabel(name),
    icon,
  })),
  ...Object.entries(LEGACY_TERMINAL_PRESET_ICON_NAMES)
    .filter(([id]) => !CANONICAL_LUCIDE_ICON_IDS.has(id))
    .map(([id, name]) => ({
      id,
      label: lucideIconLabel(name),
      icon: LucideIcons[name],
    })),
].filter((option, index, options) =>
  option.icon &&
  options.findIndex((candidate) => candidate.id === option.id) === index
)
  .sort((left, right) => left.label.localeCompare(right.label));
export const TERMINAL_PRESET_ICON_BY_ID = Object.fromEntries(
  TERMINAL_PRESET_ICON_OPTIONS.map((option) => [option.id, option]),
);

export const BUILTIN_TERMINAL_PROFILES = [
  { id: "bash", name: "Bash", type: "gojs", icon: "terminal", builtin: true },
  {
    id: "crush",
    name: "Crush",
    program: "crush",
    args: "",
    type: "gojs",
    env: "",
    wd: "",
    icon: "bot",
    builtin: true,
  },
];

export const WANIX_RUNTIME = {
  wasmUrl: "https://w9y.io/go/github.com/justwasm/wanix/wasm@v0.4.25",
  moduleUrl:
    "https://cdn.jsdelivr.net/gh/justwasm/wanix@v0.4.25/dist/wanix.min.js",
};

// The bundled shell binary (hush, mounted as /bin/bash). Pinned to a
// semver tag; isLegacyHushBinaryUrl auto-upgrades older pins on load so
// kernel-interpreter fixes (e.g. fd>2 redirects, script args) reach
// existing workspaces without a manual reset.
export const HUSH_BINARY_VERSION = "v0.5.9";
export const DEFAULT_HUSH_BINARY_URL =
  "https://w9y.io/go/github.com/btwiuse/hush/cmd/hush@v0.5.9";
export const W9Y_BINARY_VERSION = "v0.0.6";
export const DEFAULT_W9Y_BINARY_URL =
  "https://w9y.io/go/github.com/btwiuse/w9y/cmd/w9y@v0.0.6";
export function isLegacyHushBinaryUrl(url) {
  return typeof url === "string" &&
    url.includes("github.com/btwiuse/hush/cmd/hush@") &&
    (!url.includes(`hush@${HUSH_BINARY_VERSION}`) ||
      url.includes("w9y.up.railway.app"));
}

// The shell toolset is bound PER TASK (workspace.binds), not into the
// system root: every task that needs bash/w9y declares its own private
// /bin (fresh ramfs) plus the wasm binaries and the shell rc file, the
// way crushrc is mounted per task. Keeping them out of
// DEFAULT_SYSTEM_CONFIG means the root namespace stays clean, so the VM
// guest (which mounts the root at / via 9p) never sees host-side wasm
// tools it cannot run. ensureGearShellBinds migrates existing workspaces
// into this layout. The profile ships as a file bind at preset/profile,
// riding on a per-task fresh ramfs at /preset (the crushrc mount point,
// CRUSH_RUN_DIR): a type "file" bind resolves through whatever fs owns
// the parent path, so it is only safe when that parent is a task-private
// fresh fs — preset is, the shared root ramfs is not.
export const SHELL_PROFILE_CONTENT = `function w9y_detect() {
  path="$LOCATION"
  OLDIFS=$IFS
  IFS='/'

  set -- $path

  IFS=$OLDIFS

  for x; do
    [[ -d $HOME/.w9y/$x ]] && continue
    w9y mod apply -v "$x" && mkdir -p $HOME/.w9y/$x
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
`;
export const TASK_SHELL_BINDS = [
  {
    id: "task-bin",
    type: "ns",
    dst: "bin",
    src: "#ramfs/new",
    perm: "0755",
  },
  {
    id: "task-bash",
    type: "fetch",
    dst: "bin/bash",
    src: DEFAULT_HUSH_BINARY_URL,
    perm: "0755",
  },
  {
    id: "task-w9y",
    type: "fetch",
    dst: "bin/w9y",
    src: DEFAULT_W9Y_BINARY_URL,
    perm: "0755",
  },
  {
    id: "task-preset",
    type: "ns",
    dst: "preset",
    src: "#ramfs/new",
  },
  {
    id: "task-profile",
    type: "file",
    dst: "preset/profile",
    perm: "0666",
    content: SHELL_PROFILE_CONTENT,
  },
];

export const DEFAULT_SYSTEM_CONFIG = {
  binds: [
    { id: "root", type: "ns", dst: ".", src: "#ramfs/new" },
    { id: "task", type: "ns", dst: "task", src: "#task" },
    { id: "term", type: "ns", dst: "term", src: "#term" },
    { id: "web", type: "ns", dst: "web", src: "#web" },
    { id: "js", type: "ns", dst: "js", src: "#js" },
    { id: "opfs", type: "ns", dst: "opfs", src: "#web/opfs", mode: "0755" },
    { id: "tmp", type: "ns", dst: "tmp", src: "#ramfs/new" },
  ],
};

export const WORKSPACE_PRESETS = {
  "hush-shell": {
    name: "Bash Shell",
    description:
      "The current Gear Shell environment with Bash and persistent OPFS storage.",
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [],
  },
  empty: {
    name: "Empty Namespace",
    description:
      "A blank in-memory Wanix namespace for composing binds and tasks.",
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [],
  },
  "js-worker": {
    name: "JavaScript Worker",
    description:
      "An inline JavaScript task that can be edited and started in the browser.",
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [
      {
        id: "main-js",
        type: "file",
        dst: "main.js",
        perm: "0766",
        content: "console.log('Wanix JavaScript task started');",
      },
    ],
    tasks: [{
      id: "main",
      name: "main.js",
      cmd: "main.js",
      type: "js",
      env: "",
      wd: ".",
      fsys: ".",
      term: false,
      autoStart: true,
    }],
  },
  "wasi-terminal": {
    name: "WASI Terminal",
    description:
      "A terminal-ready WASI task. Add a .wasm file before starting it.",
    runtime: { ...WANIX_RUNTIME, debug: false },
    binds: [],
    tasks: [{
      id: "main",
      name: "main.wasm",
      cmd: "main.wasm",
      type: "wasi",
      env: "",
      wd: ".",
      fsys: ".",
      term: true,
      autoStart: false,
    }],
  },
};
