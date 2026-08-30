// app-plugin-manifests.js — the DEFAULT_PLUGINS registry (500-line split
// out of app-constants.js). Pure data: the built-in plugin manifests the
// kernel loads at boot and the Plugins page lists. Every manifest here is
// the copyable template for a third-party plugin (component, iframe, or
// overlay registration kind). The `examples` bind provider lives in
// app-plugin-manifests-examples.js (500-line split).

import { EXAMPLES_PLUGIN } from "./app-plugin-manifests-examples.js";
import { BBTEX_PLUGIN, BBTEX_IFRAME_PLUGIN } from "./app-plugin-manifests-bbtex.js";

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
export const W9Y_BINARY_VERSION = "v0.0.9";
export const DEFAULT_W9Y_BINARY_URL =
  "https://w9y.io/go/github.com/justwasm/w9y/cmd/w9y@v0.0.9";
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
    entry: "/plugin/music/music-plugin.js",
    css: [
      "/plugin/music/music.css",
      "/plugin/music/vfs-picker.css",
    ],
    permissions: {
      api: ["music.*", "panels.open", "panels.list"],
    },
  },
  // The system package manager: shows the w9y install registry (owned by
  // the w9y CLI at wanix/w9y-registry.json) with install/remove/re-apply
  // and a declared-version comparison against plugin w9y deps. Required
  // like shell-tools: package management must not be disableable.
  {
    id: "w9y",
    name: "Packages",
    version: "1.0.0",
    icon: "Boxes",
    entry: "/plugin/w9y/w9y-plugin.js",
    css: ["/plugin/w9y/w9y.css"],
    required: true,
    permissions: {
      api: ["w9y.*", "events.on", "events.off", "events.drain", "config.getShell"],
    },
  },
  {
    id: "deck",
    name: "Deck",
    version: "1.0.0",
    icon: "LayoutDashboard",
    entry: "/plugin/deck/deck-plugin.js",
    // Reveal.js library + black theme come from the CDN (the reveal.js JS
    // is also a CDN script in index.html); deck.css / reveal.css are the
    // local overrides and must load after the library styles.
    css: [
      "https://cdn.jsdelivr.net/npm/reveal.js@6.0.1/dist/reveal.css",
      "https://cdn.jsdelivr.net/npm/reveal.js@6.0.1/dist/theme/black.css",
      "/plugin/deck/deck.css",
      "/plugin/deck/reveal.css",
    ],
  },
  {
    id: "group",
    name: "Group",
    version: "1.0.0",
    icon: "UsersRound",
    entry: "/plugin/group/group-plugin.js",
  },
  {
    id: "runtime",
    name: "Runtime",
    version: "1.0.0",
    icon: "Activity",
    entry: "/plugin/runtime/runtime-plugin.js",
    css: ["/plugin/runtime/runtime.css"],
  },
  {
    id: "playground",
    name: "Playground",
    version: "1.0.0",
    icon: "SlidersHorizontal",
    entry: "/plugin/playground/playground-plugin.js",
    css: ["/plugin/playground/playground.css"],
  },
  {
    id: "home",
    name: "Home",
    version: "1.0.0",
    icon: "House",
    entry: "/plugin/home/home-plugin.js",
    css: ["/plugin/home/home.css"],
    permissions: {
      api: ["terminal.embed"],
    },
  },
  {
    id: "files",
    name: "Files",
    version: "1.0.0",
    icon: "FolderOpen",
    entry: "/plugin/files/files-plugin.js",
    css: ["/plugin/files/files.css"],
  },
  {
    id: "workbench",
    name: "Workbench",
    version: "1.0.0",
    icon: "Monitor",
    entry: "/plugin/workbench/workbench-plugin.js",
  },
  {
    id: "vm",
    name: "VM",
    version: "1.0.0",
    icon: "Cpu",
    entry: "/plugin/vm/vm-plugin.js",
  },
  {
    id: "settings",
    name: "Settings",
    version: "1.0.0",
    icon: "Settings",
    entry: "/plugin/settings/settings-plugin.js",
    css: ["/plugin/settings/settings.css"],
  },
  {
    id: "launcher",
    name: "Launcher",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/plugin/launcher/launcher-plugin.js",
    css: ["/plugin/launcher/launcher.css"],
  },
  {
    id: "crush-runner",
    name: "Crush Runner",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/plugin/crush-runner/crush-runner-plugin.js",
    css: ["/plugin/crush-runner/crush-runner.css"],
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
  // A full-bleed terminal as an iframe plugin: the page renders xterm
  // itself inside a window-style frame (traffic lights + monospace title
  // bar, mimicking the Home demo frame) and drives a real wanix kernel
  // session through the terminal data bridge (workspace-terminal-bridge).
  // Iframe plugins load their own stylesheet — no css: entry (that would
  // inject the page's full-screen rules into the shell chrome).
  {
    id: "terminal-frame",
    name: "Terminal",
    version: "1.0.0",
    icon: "SquareTerminal",
    iframe: {
      src: "/plugin/terminal-frame/index.html",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
    permissions: {
      api: [
        "terminal.create",
        "terminal.write",
        "terminal.resize",
        "terminal.dispose",
        "panels.list",
        "events.on",
        "events.off",
        "config.getShell",
      ],
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
    entry: "/plugin/web-pet/web-pet-plugin.js",
  },
  {
    id: "widgetbot",
    name: "Discord Widget",
    version: "1.0.0",
    icon: "MessageSquare",
    entry: "/plugin/widgetbot/widgetbot-plugin.js",
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
  // The GearShell plugin template: a reference implementation showing
  // every extension point (panel + settings section + overlay + the
  // permission-scoped API) from one entry module. It appears in the
  // Plugins page but ships DISABLED — nothing imports or fetches until
  // you enable it. Copy plugin/template/ as the starting point for your
  // own plugin.
  //
  // Other manifest fields you can declare:
  //   wasm:   [{ id, dst, src }]              binaries mounted into every
  //                                           task namespace at dst
  //   files:  [{ id, dst, src }]              fetched resources (any kind,
  //                                           e.g. js worker scripts or
  //                                           wasi modules) mounted into
  //                                           every task namespace at dst
  //   preset: [{ id, dst, content, perm }]    inline files on /preset
  //   w9y:    { mod, version? }               a package the w9y CLI
  //                                           installs (dual-mode deps)
  //   iframe: { src, allow?, allowFullscreen? } a sandboxed app instead
  //                                           of an entry module
  //   required: true                          cannot be disabled/removed
  {
    id: "template",
    name: "Plugin Template",
    version: "1.0.0",
    icon: "BookOpen",
    entry: "/plugin/template/template-plugin.js",
    css: ["/plugin/template/template.css"],
    // Disabled by default: the plugin shows up in the Plugins page for
    // reference but is not loaded until the user enables it.
    enabled: false,
    permissions: {
      api: [
        "config.getShell",
        "tasks.create",
        "tasks.list",
        "tasks.output",
        "events.on",
        "events.off",
        "events.drain",
        "w9y.list",
        "w9y.status",
        "terminal.embed",
        "panels.open",
      ],
    },
  },
  // The iframe plugin template: the iframe counterpart of plugin/template/.
  // Instead of an entry module it declares iframe.src (a self-contained
  // HTML app) plus permissions.api — the exact list of window.GearShell
  // methods the iframe may call through /gear-bridge.js (default: none =
  // every call denied). Copy plugin/iframe-template-plugin/ to start your
  // own iframe plugin: keep iframe.src + permissions.api, load
  // /gear-bridge.js in the page, and call GearShell.<method>.<path>() from
  // there. Disabled by default like the component template.
  {
    id: "iframe-template",
    name: "Iframe Plugin Template",
    version: "1.0.0",
    icon: "Frame",
    iframe: {
      src: "/plugin/iframe-template-plugin/index.html",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
    // No css: entry — the iframe page is self-contained and inlines its
    // own stylesheet. Declaring css: here would make injectPluginCss
    // apply the page's body/universal rules to the SHELL chrome.
    enabled: false,
    permissions: {
      api: [
        "panels.list",
        "panels.open",
        "music.nowPlaying",
        "music.play",
        "music.pause",
        "events.on",
        "events.off",
        "config.getShell",
        // The iframe terminal data bridge: create a kernel session and
        // stream bytes (the iframe renders xterm itself). Only add these
        // to plugins you trust — terminal.write is keyboard injection.
        "terminal.create",
        "terminal.write",
        "terminal.resize",
        "terminal.dispose",
      ],
    },
  },
];

// The examples + bbtex bind providers are data, not logic: pushed after
// the array literal so DEFAULT_PLUGINS stays one flat list (see
// app-plugin-manifests-examples.js / app-plugin-manifests-bbtex.js).
DEFAULT_PLUGINS.push(EXAMPLES_PLUGIN);
DEFAULT_PLUGINS.push(BBTEX_PLUGIN);
// iframe edition of the bbtex playground (default DISABLED — the module
// bbtex stays the default; enable bbtex-iframe to A/B the two).
DEFAULT_PLUGINS.push({ ...BBTEX_IFRAME_PLUGIN, enabled: false });
