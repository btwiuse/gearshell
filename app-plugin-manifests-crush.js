// app-plugin-manifests-crush.js — the Crush Playground plugin manifest
// + the iframe plugin template. Split out of app-plugin-manifests.js
// (500-line rule).
//
// Crush Playground is the iframe entry point; it declares the
// `crush` w9y mod dep which ensureW9yDependencies skips on boot
// (iframe plugins install lazily on first panel open — see
// addIframePanel in panels.js). The iframe template is grouped
// here too because it's the canonical "copy me" starting point
// that ships `config.kv.*` in its example permissions
// list — keeping it next to the real Crush keeps the example
// honest.

export const CRUSH_PLUGINS = [
  {
    id: "crush-playground",
    name: "Crush Playground",
    version: "0.1.0",
    icon: "Star",
    iframe: {
      src: "/plugin/crush-playground/index.html",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
    permissions: {
      api: [
        "config.kv.*",
        "w9y.status",
        "tasks.create",
        "tasks.output",
        "events.on",
        "events.off",
        "terminal.create",
        "terminal.write",
        "terminal.resize",
        "terminal.dispose",
      ],
    },
    // Lazy w9y install: addIframePanel triggers `w9y mod apply crush`
    // on first panel open, so the iframe opens to a ready-to-launch
    // UI in the happy path. ensureW9yDependencies skips iframe
    // plugins on boot, so the install cost is paid only when the
    // user actually opens the panel. The install button on the page
    // stays as a recovery path for offline / version-drift scenarios.
    w9y: { mod: "crush" },
  },
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
  // The iframe plugin template: a self-contained iframe app reference.
  // Instead of an entry module it declares iframe.src (a self-contained
  // HTML app) plus permissions.api — the exact list of window.GearShell
  // methods the iframe may call through /plugin/gear-bridge.js (default: none =
  // every call denied). Copy plugin/iframe-template-plugin/ to start your
  // own iframe plugin: keep iframe.src + permissions.api, load
  // /plugin/gear-bridge.js in the page, and call GearShell.<method>.<path>() from
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
        "config.kv.*",
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