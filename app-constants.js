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
export const DEFAULT_CMD = "bash -rcfile /profile";
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
  workbenchAssetsUrl: DEFAULT_WORKBENCH_ASSETS_URL,
  vmBackendUrl: DEFAULT_VM_BACKEND_URL,
  vmLinuxUrl: DEFAULT_VM_LINUX_URL,
  vmMemory: "512M",
  vmNetworkMode: "none",
  vmWispUrl: "",
  wagiDogEnabled: true,
  collapsedLauncherItems: DEFAULT_COLLAPSED_LAUNCHER_ITEMS,
  launcherOrder: DEFAULT_LAUNCHER_ITEM_ORDER,
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
  wasmUrl:
    "https://w9y.io/go/github.com/justwasm/wanix/wasm@v0.4.8",
  moduleUrl:
    "https://cdn.jsdelivr.net/gh/justwasm/wanix@v0.4.8/dist/wanix.min.js",
};

export const DEFAULT_SYSTEM_CONFIG = {
  binds: [
    { id: "root", type: "ns", dst: ".", src: "#ramfs/new" },
    { id: "task", type: "ns", dst: "task", src: "#task" },
    { id: "term", type: "ns", dst: "term", src: "#term" },
    { id: "web", type: "ns", dst: "web", src: "#web" },
    { id: "js", type: "ns", dst: "js", src: "#js" },
    { id: "opfs", type: "ns", dst: "opfs", src: "#web/opfs", mode: "0755" },
    { id: "tmp", type: "ns", dst: "tmp", src: "#ramfs/new" },
    {
      id: "bash",
      type: "fetch",
      dst: "bash",
      src:
        "https://w9y.io/go/github.com/btwiuse/hush/cmd/hush@v0.5.6",
      mode: "0755",
    },
    {
      id: "w9y",
      type: "fetch",
      dst: "w9y",
      src:
        "https://w9y.io/go/github.com/btwiuse/w9y/cmd/w9y@v0.0.5",
      mode: "0755",
    },
    {
      id: "boot-profile",
      type: "file",
      dst: "profile",
      mode: "0666",
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
export function ensure_home() {
  [[ -d $HOME ]] || mkdir -p $HOME
}
ensure_home
cd $HOME
w9y_detect
`,
    },
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
