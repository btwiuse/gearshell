// rv64 — RISC-V 64 Linux (rv64.js) as an iframe plugin that drives the
// VM through the HOST wanix kernel. The page renders a bare xterm and
// uses vm.create + the terminal.* data bridge (like the v86 plugin):
// vm.create spawns a <wanix-vm type="rv64"> in the host kernel and the
// page streams its term device, so the guest sees the live WANIX
// namespace (and its #task device paths).
export const RV64_IFRAME_PLUGIN = {
  id: "rv64",
  name: "RISC-V 64 Linux (rv64.js)",
  version: "0.1.0",
  icon: "Cpu",
  iframe: {
    src: "/plugin/rv64/index.html",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  permissions: {
    // vm.create spawns the rv64 VM in the host kernel; the page then
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
