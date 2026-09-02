export const V86_IFRAME_PLUGIN = {
  id: "v86",
  name: "x86 Linux (v86)",
  version: "0.1.0",
  icon: "Cpu",
  iframe: {
    src: "/plugin/v86/index.html",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  permissions: {
    // vm.create spawns the v86 VM in the host kernel; the page then
    // drives the terminal with the terminal.* data bridge.
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
