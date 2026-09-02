// app-plugin-manifests-iframes.js — the simpler iframe-plugin
// manifests (no permissions block beyond the bridge iframe allowance).
// Split out of app-plugin-manifests.js (500-line rule).
//
// Each entry is one plugin's manifest literal; add new iframe plugins
// here unless they need permissions or extra fields, in which case
// they earn their own file. Top-level DEFAULT_PLUGINS picks up
// IFRAME_PLUGINS through spread.

export const IFRAME_PLUGINS = [
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
  // Notes: an Apple Notes–style iframe plugin. Three-pane layout
  // (sidebar / list / editor) with folders, pinning, and full-text
  // search. Persistence is the generic per-workspace config.kv store
  // (see plugin/crush-playground/kv-api.js), so notes survive reloads
  // and live-sync across every open Notes panel via the
  // "config.changed" event the kv store emits on each write.
  // Disabled by default — opt in via the Plugins page.
  {
    id: "notes",
    name: "Notes",
    version: "1.0.0",
    icon: "NotebookPen",
    iframe: {
      src: "/plugin/notes/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    permissions: {
      api: [
        "config.kv.get",
        "config.kv.set",
        "config.kv.delete",
        "config.kv.list",
        "events.on",
        "events.off",
      ],
    },
    enabled: false,
  },
  // App Store: a buildless iframe plugin that replaces the in-page
  // Plugins management page with a richer UI (Card + List views,
  // tag-chip filter, search, "Open" shortcut for enabled plugins).
  // Talks to the same config.plugins.* / panels.* surface as the
  // in-page version — the bridge proxies every GearShell.* call across
  // postMessage, gated by this plugin's permissions.api whitelist.
  // Disabled by default — opt in via the Plugins page.
  {
    id: "app-store",
    name: "App Store",
    version: "1.0.0",
    icon: "Store",
    iframe: {
      src: "/plugin/app-store/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    permissions: {
      api: [
        "config.plugins.list",
        "config.plugins.install",
        "config.plugins.remove",
        "config.plugins.setEnabled",
        "panels.list",
        "panels.open",
        "panels.close",
        "panels.focus",
        "events.on",
        "events.off",
      ],
    },
    enabled: false,
  },
  // Lucide Icons browser: a buildless iframe plugin that uses an
  // importmap to load lucide-react from esm.sh. The page is fully
  // self-contained (it doesn't call any GearShell.* bridge API — the
  // icons ship with the bundle), so no permissions entry is needed.
  // Features: case-insensitive AND-token search, virtualised listing
  // (IntersectionObserver grows the render window), grid + list view,
  // PascalCase ↔ kebab-case name toggle (click an icon to copy the name
  // in the convention the user picked). Disabled by default — opt in via
  // the Plugins page; the lucide bundle is heavy (~600 KB esm.sh).
  {
    id: "lucide-icons",
    name: "Lucide Icons",
    version: "1.0.0",
    icon: "Sparkles",
    iframe: {
      src: "/plugin/lucide-icons/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    enabled: false,
  },
  {
    id: "deck",
    name: "Deck",
    version: "1.0.0",
    icon: "LayoutDashboard",
    iframe: {
      src: "/plugin/deck/index.html",
      allow: "clipboard-read; clipboard-write",
    },
    enabled: false,
  },
  {
    id: "crush",
    name: "Crush",
    version: "1.0.0",
    icon: "Bot",
    iframe: {
      src: "https://justwasm.github.io/crush/",
    },
    // Disabled by default — the upstream justwasm.io/crush demo is the
    // upstream of the same agent but isn't wired into the shell's
    // preset/snapshot system. Use the canonical "Crush Playground"
    // iframe plugin instead, which integrates the generic config.kv store,
    // w9y mod install on first open, and the terminal data bridge.
    enabled: false,
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
    enabled: false,
  },
  {
    id: "widgetbot",
    name: "Discord Widget",
    version: "1.0.0",
    icon: "MessageSquare",
    entry: "/plugin/widgetbot/widgetbot-plugin.js",
    enabled: false,
  },
];