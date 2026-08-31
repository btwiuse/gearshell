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
    api: [],
  },
};
