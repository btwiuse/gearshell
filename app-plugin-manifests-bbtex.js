// app-plugin-manifests-bbtex.js — the `bbtex-iframe` plugin manifest
// (500-line split out of app-plugin-manifests.js). Pure data: the Bubble
// Tea playground as an iframe plugin. The example binaries land on
// /opfs/wanix/examples/<id> via the w9y dependency; the page renders its
// own xterm and drives the examples through the terminal data bridge
// (terminal.create/write/resize/dispose + term.data/term.exit events).

// iframe edition of the Bubble Tea playground: the page renders its own
// xterm and drives the example binaries through the terminal data bridge
// (terminal.create/write/resize/dispose + term.data/term.exit events).
export const BBTEX_IFRAME_PLUGIN = {
    id: "bbtex-iframe",
    name: "Bubble Tea Playground (iframe)",
    version: "1.0.0",
    icon: "Sprout",
    iframe: {
      src: "/plugin/bbtex-iframe/index.html",
      allow: "clipboard-read; clipboard-write; fullscreen",
      allowFullscreen: true,
    },
    permissions: {
      api: [
        "terminal.create",
        "terminal.write",
        "terminal.resize",
        "terminal.dispose",
        "events.on",
        "events.off",
        "w9y.status",
      ],
    },
    w9y: { mod: "bbtex", version: "v2.0.12" },
};
