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
    entry: "/plugin/music/music-plugin.js?v=20260829.27",
    permissions: {
      api: ["music.*", "panels.open", "panels.list"],
    },
  },
  {
    id: "deck",
    name: "Deck",
    version: "1.0.0",
    icon: "LayoutDashboard",
    entry: "/plugin/deck/deck-plugin.js?v=20260829.7",
  },
  {
    id: "group",
    name: "Group",
    version: "1.0.0",
    icon: "UsersRound",
    entry: "/plugin/group/group-plugin.js?v=20260829.45",
  },
  {
    id: "runtime",
    name: "Runtime",
    version: "1.0.0",
    icon: "Activity",
    entry: "/plugin/runtime/runtime-plugin.js?v=20260829.56",
  },
  {
    id: "playground",
    name: "Playground",
    version: "1.0.0",
    icon: "SlidersHorizontal",
    entry: "/plugin/playground/playground-plugin.js?v=20260829.93",
  },
  {
    id: "home",
    name: "Home",
    version: "1.0.0",
    icon: "House",
    entry: "/plugin/home/home-plugin.js?v=20260829.68",
    permissions: {
      api: ["terminal.embed"],
    },
  },
  {
    id: "files",
    name: "Files",
    version: "1.0.0",
    icon: "FolderOpen",
    entry: "/plugin/files/files-plugin.js?v=20260829.101",
  },
  {
    id: "workbench",
    name: "Workbench",
    version: "1.0.0",
    icon: "Monitor",
    entry: "/plugin/workbench/workbench-plugin.js?v=20260829.102",
  },
  {
    id: "vm",
    name: "VM",
    version: "1.0.0",
    icon: "Cpu",
    entry: "/plugin/vm/vm-plugin.js?v=20260829.103",
  },
  {
    id: "settings",
    name: "Settings",
    version: "1.0.0",
    icon: "Settings",
    entry: "/plugin/settings/settings-plugin.js?v=20260829.107",
  },
  {
    id: "launcher",
    name: "Launcher",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/plugin/launcher/launcher-plugin.js?v=20260829.80",
  },
  {
    id: "crush-runner",
    name: "Crush Runner",
    version: "1.0.0",
    icon: "Rocket",
    entry: "/plugin/crush-runner/crush-runner-plugin.js?v=20260829.108",
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
    entry: "/plugin/web-pet/web-pet-plugin.js?v=20260829.34",
  },
  {
    id: "widgetbot",
    name: "Discord Widget",
    version: "1.0.0",
    icon: "MessageSquare",
    entry: "/plugin/widgetbot/widgetbot-plugin.js?v=20260829.7",
  },
  // Bubble Tea playground: every example from the bbtex manifest
  // (https://w9y.io/manifest/bbtex@v2.0.12/) as plugin-declared wasm deps
  // — each example binary mounts at bin/<example> in every task namespace
  // and runs in an embedded terminal (terminal.embed) with
  // profile.cmd = example id. pager additionally reads artichoke.md from
  // its CWD, so that file ships as a preset on /preset and the pager
  // profile starts with wd=/preset. Upgrade the examples by bumping the
  // @v2.0.12 pins below (and the panel list in plugin/bbtex/bbtex.js).
  {
    id: "bbtex",
    name: "Bubble Tea Playground",
    version: "1.0.0",
    icon: "Sprout",
    entry: "/plugin/bbtex/bbtex-plugin.js?v=20260830.10",
    permissions: { api: ["terminal.embed"] },
    wasm: [
      { id: "altscreen-toggle", dst: "bin/altscreen-toggle", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/altscreen-toggle@v2.0.12" },
      { id: "autocomplete", dst: "bin/autocomplete", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/autocomplete@v2.0.12" },
      { id: "canvas", dst: "bin/canvas", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/canvas@v2.0.12" },
      { id: "capability", dst: "bin/capability", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/capability@v2.0.12" },
      { id: "cellbuffer", dst: "bin/cellbuffer", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/cellbuffer@v2.0.12" },
      { id: "chat", dst: "bin/chat", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/chat@v2.0.12" },
      { id: "clickable", dst: "bin/clickable", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/clickable@v2.0.12" },
      { id: "colorprofile", dst: "bin/colorprofile", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/colorprofile@v2.0.12" },
      { id: "composable-views", dst: "bin/composable-views", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/composable-views@v2.0.12" },
      { id: "cursor-style", dst: "bin/cursor-style", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/cursor-style@v2.0.12" },
      { id: "debounce", dst: "bin/debounce", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/debounce@v2.0.12" },
      { id: "doom-fire", dst: "bin/doom-fire", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/doom-fire@v2.0.12" },
      { id: "dynamic-textarea", dst: "bin/dynamic-textarea", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/dynamic-textarea@v2.0.12" },
      { id: "exec", dst: "bin/exec", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/exec@v2.0.12" },
      { id: "eyes", dst: "bin/eyes", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/eyes@v2.0.12" },
      { id: "file-picker", dst: "bin/file-picker", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/file-picker@v2.0.12" },
      { id: "focus-blur", dst: "bin/focus-blur", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/focus-blur@v2.0.12" },
      { id: "fullscreen", dst: "bin/fullscreen", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/fullscreen@v2.0.12" },
      { id: "glamour", dst: "bin/glamour", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/glamour@v2.0.12" },
      { id: "help", dst: "bin/help", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/help@v2.0.12" },
      { id: "http", dst: "bin/http", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/http@v2.0.12" },
      { id: "isbn-form", dst: "bin/isbn-form", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/isbn-form@v2.0.12" },
      { id: "keyboard-enhancements", dst: "bin/keyboard-enhancements", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/keyboard-enhancements@v2.0.12" },
      { id: "list-default", dst: "bin/list-default", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/list-default@v2.0.12" },
      { id: "list-fancy", dst: "bin/list-fancy", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/list-fancy@v2.0.12" },
      { id: "list-simple", dst: "bin/list-simple", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/list-simple@v2.0.12" },
      { id: "mouse", dst: "bin/mouse", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/mouse@v2.0.12" },
      { id: "package-manager", dst: "bin/package-manager", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/package-manager@v2.0.12" },
      { id: "pager", dst: "bin/pager", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/pager@v2.0.12" },
      { id: "paginator", dst: "bin/paginator", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/paginator@v2.0.12" },
      { id: "pipe", dst: "bin/pipe", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/pipe@v2.0.12" },
      { id: "prevent-quit", dst: "bin/prevent-quit", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/prevent-quit@v2.0.12" },
      { id: "print-key", dst: "bin/print-key", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/print-key@v2.0.12" },
      { id: "progress-animated", dst: "bin/progress-animated", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/progress-animated@v2.0.12" },
      { id: "progress-bar", dst: "bin/progress-bar", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/progress-bar@v2.0.12" },
      { id: "progress-download", dst: "bin/progress-download", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/progress-download@v2.0.12" },
      { id: "progress-static", dst: "bin/progress-static", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/progress-static@v2.0.12" },
      { id: "query-term", dst: "bin/query-term", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/query-term@v2.0.12" },
      { id: "realtime", dst: "bin/realtime", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/realtime@v2.0.12" },
      { id: "result", dst: "bin/result", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/result@v2.0.12" },
      { id: "send-msg", dst: "bin/send-msg", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/send-msg@v2.0.12" },
      { id: "sequence", dst: "bin/sequence", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/sequence@v2.0.12" },
      { id: "set-terminal-color", dst: "bin/set-terminal-color", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/set-terminal-color@v2.0.12" },
      { id: "set-window-title", dst: "bin/set-window-title", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/set-window-title@v2.0.12" },
      { id: "simple", dst: "bin/simple", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/simple@v2.0.12" },
      { id: "space", dst: "bin/space", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/space@v2.0.12" },
      { id: "spinner", dst: "bin/spinner", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/spinner@v2.0.12" },
      { id: "spinners", dst: "bin/spinners", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/spinners@v2.0.12" },
      { id: "splash", dst: "bin/splash", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/splash@v2.0.12" },
      { id: "split-editors", dst: "bin/split-editors", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/split-editors@v2.0.12" },
      { id: "stopwatch", dst: "bin/stopwatch", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/stopwatch@v2.0.12" },
      { id: "suspend", dst: "bin/suspend", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/suspend@v2.0.12" },
      { id: "table", dst: "bin/table", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/table@v2.0.12" },
      { id: "table-resize", dst: "bin/table-resize", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/table-resize@v2.0.12" },
      { id: "tabs", dst: "bin/tabs", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/tabs@v2.0.12" },
      { id: "textarea", dst: "bin/textarea", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/textarea@v2.0.12" },
      { id: "textinput", dst: "bin/textinput", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/textinput@v2.0.12" },
      { id: "textinputs", dst: "bin/textinputs", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/textinputs@v2.0.12" },
      { id: "timer", dst: "bin/timer", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/timer@v2.0.12" },
      { id: "tui-daemon-combo", dst: "bin/tui-daemon-combo", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/tui-daemon-combo@v2.0.12" },
      { id: "vanish", dst: "bin/vanish", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/vanish@v2.0.12" },
      { id: "views", dst: "bin/views", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/views@v2.0.12" },
      { id: "window-size", dst: "bin/window-size", src: "https://w9y.io/go/github.com/bubbletui/bubbletea/v2/examples/window-size@v2.0.12" },
    ],
      preset: [
        { id: "pager-artichoke", dst: "preset/artichoke.md", content: `
Glow
====

A casual introduction. 你好世界!

## Let’s talk about artichokes

The _artichoke_ is mentioned as a garden plant in the 8th century BC by Homer
**and** Hesiod. The naturally occurring variant of the artichoke, the cardoon,
which is native to the Mediterranean area, also has records of use as a food
among the ancient Greeks and Romans. Pliny the Elder mentioned growing of
_carduus_ in Carthage and Cordoba.

> He holds him with a skinny hand,
> ‘There was a ship,’ quoth he.
> ‘Hold off! unhand me, grey-beard loon!’
> An artichoke, dropt he.

--Samuel Taylor Coleridge, [The Rime of the Ancient Mariner][rime]

[rime]: https://poetryfoundation.org/poems/43997/

## Other foods worth mentioning

1. Carrots
1. Celery
1. Tacos
    * Soft
    * Hard
1. Cucumber

## Things to eat today

* [x] Carrots
* [x] Ramen
* [ ] Currywurst

### Power levels of the aforementioned foods

| Name       | Power | Comment          |
| ---        | ---   | ---              |
| Carrots    | 9001  | It’s over 9000?! |
| Ramen      | 9002  | Also over 9000?! |
| Currywurst | 10000 | What?!           |

## Currying Artichokes

Here’s a bit of code in [Haskell](https://haskell.org), because we are fancy.
Remember that to compile Haskell you’ll need \`ghc\`.

\`\`\`haskell
module Main where

import Data.Function ( (&) )
import Data.List ( intercalculate )

hello :: String -> String
hello s =
    "Hello, " ++ s ++ "."

main :: IO ()
main =
    map hello [ "artichoke", "alcachofa" ] & intercalculate "\\n" & putStrLn
\`\`\`

***

_Alcachofa_, if you were wondering, is artichoke in Spanish.
` },
      ],
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
