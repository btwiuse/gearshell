// rv64 — RISC-V 64 Linux (rv64.js) as a self-contained iframe
// plugin. The page renders xterm, loads the RV64 emulator WASM + Alpine
// disk from a static assets host, and tunnels raw ethernet frames to the
// shared vnet gateway (DHCP/DNS/TCP+UDP egress) — no gear API needed.
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
    api: [],
  },
};
