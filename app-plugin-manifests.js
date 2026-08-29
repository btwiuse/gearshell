// app-plugin-manifests.js — the DEFAULT_PLUGINS registry (500-line split
// out of app-constants.js). Pure data: the built-in plugin manifests the
// kernel loads at boot and the Plugins page lists. Every manifest here is
// the copyable template for a third-party plugin (component, iframe, or
// overlay registration kind).

// --- Shell toolset (the per-task tool binds) ---
// The bash/w9y/gear binaries and the shell rc file ship as the
// `shell-tools` plugin below, not as kernel binds: the plugin mechanism
// reconciles them into workspace.binds (app-plugin-binds.js), so the
// version lives in this manifest and upgrades ride the plugin. These
// constants are re-exported through app-constants.js for legacy
// importers (app-normalize, gear-bind).

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

// The Go gear CLI (cmd/gear, candidate replacement for the bash bin/gear
// script): same jsfs fd-bridge wire protocol, cobra/fang arg parsing.
export const GEAR_BINARY_VERSION = "v0.0.3";
export const DEFAULT_GEAR_BINARY_URL =
  "https://w9y.io/go/github.com/btwiuse/gearshell/cmd/gear@v0.0.3";

// Shell rc file shipped on the per-task /preset ramfs; keeps the
// w9y_detect bootstrap that installs w9y mods into $HOME/.w9y on demand.
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

export const DEFAULT_PLUGINS = [
  {
    id: "music",
    name: "Music",
    version: "1.0.0",
    icon: "Music2",
    entry: "/music-plugin.js?v=20260829.22",
    permissions: {
      api: ["music.*", "panels.open", "panels.list"],
    },
  },
  {
    id: "deck",
    name: "Deck",
    version: "1.0.0",
    icon: "LayoutDashboard",
    entry: "/deck-plugin.js?v=20260829.2",
  },
  {
    id: "group",
    name: "Group",
    version: "1.0.0",
    icon: "UsersRound",
    entry: "/group-plugin.js?v=20260829.30",
  },
  {
    id: "runtime",
    name: "Runtime",
    version: "1.0.0",
    icon: "Activity",
    entry: "/runtime-plugin.js?v=20260829.51",
  },
  {
    id: "playground",
    name: "Playground",
    version: "1.0.0",
    icon: "SlidersHorizontal",
    entry: "/playground-plugin.js?v=20260829.78",
  },
  {
    id: "home",
    name: "Home",
    version: "1.0.0",
    icon: "House",
    entry: "/home-plugin.js?v=20260829.63",
    permissions: {
      api: ["terminal.embed"],
    },
  },
  {
    id: "files",
    name: "Files",
    version: "1.0.0",
    icon: "FolderOpen",
    entry: "/files-plugin.js?v=20260829.86",
  },
  {
    id: "workbench",
    name: "Workbench",
    version: "1.0.0",
    icon: "Monitor",
    entry: "/workbench-plugin.js?v=20260829.87",
  },
  {
    id: "vm",
    name: "VM",
    version: "1.0.0",
    icon: "Cpu",
    entry: "/vm-plugin.js?v=20260829.88",
  },
  {
    id: "settings",
    name: "Settings",
    version: "1.0.0",
    icon: "Settings",
    entry: "/settings-plugin.js?v=20260829.92",
  },
  {
    id: "launcher",
    name: "Launcher",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/launcher-plugin.js?v=20260829.73",
  },
  {
    id: "crush-runner",
    name: "Crush Runner",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/crush-runner-plugin.js?v=20260829.93",
  },
  {
    id: "browser",
    name: "Browser",
    version: "1.0.0",
    icon: "Globe2",
    iframe: {
      src: "/browser/",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
  },
  {
    id: "bonsai",
    name: "Bonsai 27B",
    version: "1.0.0",
    icon: "TreePine",
    iframe: {
      src: "/bonsai/",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
  },
  {
    id: "codigo",
    name: "Codigo",
    version: "1.0.0",
    icon: "Code2",
    iframe: {
      src: "https://codigo.dev",
    },
  },
  {
    id: "crush",
    name: "Crush",
    version: "1.0.0",
    icon: "Bot",
    iframe: {
      src: "https://justwasm.github.io/crush/",
    },
  },
  {
    id: "rickroll",
    name: "Rick Roll",
    version: "1.0.0",
    icon: "Music2",
    iframe: {
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      allow:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowFullscreen: true,
    },
  },
  // Ambient shell chrome (overlays): the plugin manifest gates
  // availability; the legacy config flags (wagiDogEnabled / widgetbot)
  // keep gating visibility so the Settings / launcher toggles keep
  // working exactly as before.
  {
    id: "web-pet",
    name: "Wagi Dog",
    version: "1.0.0",
    icon: "Dog",
    entry: "/web-pet-plugin.js?v=20260829.29",
  },
  {
    id: "widgetbot",
    name: "Discord Widget",
    version: "1.0.0",
    icon: "MessageSquare",
    entry: "/widgetbot-plugin.js?v=20260829.2",
  },
  // The per-task shell toolset. Required: disabling it would leave every
  // task without bash/w9y/gear, so the config API refuses to disable or
  // remove it. The wasm binaries and the rc file ride the plugin-declared
  // bind path (app-plugin-binds.js), replacing the old kernel binds
  // (ensureTaskShellBinds now only manages the /bin + /preset ramfs
  // parents and prunes the legacy kernel tool binds).
  {
    id: "shell-tools",
    name: "Shell Tools",
    version: "1.0.0",
    icon: "Terminal",
    required: true,
    wasm: [
      { id: "bash", dst: "bin/bash", src: DEFAULT_HUSH_BINARY_URL },
      { id: "w9y", dst: "bin/w9y", src: DEFAULT_W9Y_BINARY_URL },
      { id: "gear", dst: "bin/gear", src: DEFAULT_GEAR_BINARY_URL },
    ],
    preset: [
      {
        id: "profile",
        dst: "preset/profile",
        content: SHELL_PROFILE_CONTENT,
        perm: "0666",
      },
    ],
  },
];
