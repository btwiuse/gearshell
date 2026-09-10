export const LINUX_PLAYGROUND_PLUGIN = {
  id: "linux-playground",
  name: "Linux Playground",
  version: "0.1.0",
  icon: "TerminalSquare",
  iframe: {
    src: "/plugin/linux-playground/index.html",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  permissions: {
    api: [
      "vm.create",
      "terminal.write",
      "terminal.resize",
      "terminal.dispose",
      "events.on",
      "events.off",
    ],
  },
  enabled: false,
};
