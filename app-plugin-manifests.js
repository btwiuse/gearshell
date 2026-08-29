// app-plugin-manifests.js — the DEFAULT_PLUGINS registry (500-line split
// out of app-constants.js). Pure data: the built-in plugin manifests the
// kernel loads at boot and the Plugins page lists. Every manifest here is
// the copyable template for a third-party plugin (component, iframe, or
// overlay registration kind).

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
    entry: "/group-plugin.js?v=20260829.29",
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
    entry: "/playground-plugin.js?v=20260829.77",
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
    entry: "/files-plugin.js?v=20260829.85",
  },
  {
    id: "workbench",
    name: "Workbench",
    version: "1.0.0",
    icon: "Monitor",
    entry: "/workbench-plugin.js?v=20260829.86",
  },
  {
    id: "vm",
    name: "VM",
    version: "1.0.0",
    icon: "Cpu",
    entry: "/vm-plugin.js?v=20260829.87",
  },
  {
    id: "settings",
    name: "Settings",
    version: "1.0.0",
    icon: "Settings",
    entry: "/settings-plugin.js?v=20260829.91",
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
    entry: "/crush-runner-plugin.js?v=20260829.92",
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
    entry: "/web-pet-plugin.js?v=20260829.28",
  },
  {
    id: "widgetbot",
    name: "Discord Widget",
    version: "1.0.0",
    icon: "MessageSquare",
    entry: "/widgetbot-plugin.js?v=20260829.2",
  },
];
