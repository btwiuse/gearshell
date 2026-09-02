// app-plugin-manifests-plugins-core.js — the component-style plugin
// manifests (entry modules + optional css) bundled under one export.
// Split out of app-plugin-manifests.js (500-line rule).
//
// Each entry is one plugin's manifest literal, copied verbatim from
// the original flat list. To add a core plugin, append here; the
// top-level DEFAULT_PLUGINS picks up CORE_PLUGINS through spread.

export const CORE_PLUGINS = [
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
    enabled: false,
  },
  {
    id: "group",
    name: "Group",
    version: "1.0.0",
    icon: "UsersRound",
    entry: "/plugin/group/group-plugin.js",
    enabled: false,
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
    name: "GearShell API Playground",
    label: "GearShell API Playground",
    version: "1.0.0",
    icon: "SlidersHorizontal",
    iframe: {
      src: "/plugin/playground/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    permissions: {
      api: [
        "version",
        "ping",
        "config.*",
        "panels.*",
        "browser.*",
        "files.*",
        "tasks.*",
        "agents.*",
        "vm.*",
        "terminal.*",
        "music.*",
        "events.*",
        "w9y.*",
        "hotkeys.*",
      ],
    },
  },
  {
    id: "home",
    name: "Home",
    version: "1.0.0",
    icon: "House",
    entry: "/plugin/home/home-plugin.js",
    css: ["/plugin/home/home.css"],
    permissions: {
      api: ["terminal.create"],
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
    enabled: false,
  },
  {
    id: "settings",
    name: "Settings",
    version: "1.0.0",
    icon: "Settings",
    iframe: {
      src: "/plugin/settings/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    permissions: {
      api: [
        "config.*",
        "panels.*",
        "events.*",
      ],
    },
  },
  {
    id: "launcher",
    name: "Launcher",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/plugin/launcher/launcher-plugin.js",
    css: ["/plugin/launcher/launcher.css"],
    // Spotlight (below) is the default launch surface; the launcher
    // panel stays around for users who want a permanent tab and a
    // pinned grid. Disabled by default — re-enable from the Plugins
    // page to bring back the Task Launcher card and its addPanel hotkey.
    enabled: false,
  },
  // Spotlight: the transient, keyboard-first launcher (ctrl+shift+/).
  // A component plugin (no iframe, no postMessage roundtrip) whose
  // overlay surface is rendered directly into the shell DOM. Coexists
  // with the launcher panel above, which stays the empty-workspace
  // fallback. Talks to the shell through ctx.api (scoped to this
  // manifest's permissions.api); the css entry is the shell-side
  // positioner for the glass + card.
  {
    id: "spotlight",
    name: "Spotlight",
    version: "1.0.0",
    icon: "Search",
    entry: "/plugin/spotlight/spotlight-plugin.js",
    css: ["/plugin/spotlight/spotlight.css"],
    permissions: {
      api: [
        "panels.list",
        "panels.open",
        "panels.focus",
        "config.getShell",
        "config.plugins.list",
      ],
    },
  },
  // Default Page: the empty-workspace landing. Disabled by default
  // — glmatrix (Digital Rain, below) claims the empty-grid slot
  // instead. Re-enable from the Plugins page to bring the keyboard
  // hint + quick-launch card back as the default.
  {
    id: "default-page",
    name: "Default Page",
    version: "1.0.0",
    icon: "Home",
    entry: "/plugin/default-page/default-page-plugin.js",
    css: ["/plugin/default-page/default-page.css"],
    enabled: false,
  },
  // Digital Rain: a WebGL/WebAssembly demo page that ships as an
  // iframe-only plugin (no entry module — the page is self-contained).
  // Opts in to the empty-grid fallback so the workspace opens straight
  // into it whenever every panel is closed. css is empty because the
  // page paints its own surface; declaring a shell stylesheet here
  // would only inject host rules.
  {
    id: "glmatrix",
    name: "Digital Rain",
    version: "1.0.0",
    icon: "CloudRain",
    iframe: {
      src: "/plugin/glmatrix/index.html",
      title: "Digital Rain",
      allow: "fullscreen",
      allowFullscreen: true,
    },
    emptyGrid: true,
  },
];