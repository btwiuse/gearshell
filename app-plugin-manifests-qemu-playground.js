export const QEMU_PLAYGROUND_PLUGIN = {
  id: "qemu-playground",
  name: "QEMU Playground",
  version: "0.1.0",
  icon: "Cpu",
  iframe: {
    src: "/plugin/qemu-playground/index.html",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  enabled: false,
};
