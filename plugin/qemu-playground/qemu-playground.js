const DEMO_ROOT = "https://ktock.github.io/qemu-wasm-demo/images/alpine-x86_64/";
const $ = (id) => document.getElementById(id);
const status = $("status");

function setStatus(mode, text) {
  status.dataset.mode = mode;
  status.textContent = text;
}

function loadScript(name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = name.startsWith("http") ? name : `${DEMO_ROOT}${name}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${name}.`));
    document.head.append(script);
  });
}

function configureModule() {
  const module = window.Module || {};
  module.arguments = [
    "-nographic", "-M", "pc", "-m", "512M", "-accel", "tcg,tb-size=500",
    "-L", "/pack-rom/", "-nic", "none", "-kernel", "/pack-kernel/vmlinuz-virt",
    "-initrd", "/pack-initramfs/initramfs-virt", "-append", "console=ttyS0 root=/dev/vda noautodetect hostname=qemu-playground",
    "-drive", "id=rootfs,file=/pack-rootfs/disk-rootfs.img,format=raw,if=none",
    "-device", "virtio-blk-pci,drive=rootfs",
  ];
  module.locateFile = (path) => `${DEMO_ROOT}${path}`;
  module.mainScriptUrlOrBlob = `${DEMO_ROOT}out.js`;
  window.Module = module;
  return module;
}

async function start() {
  if (!window.crossOriginIsolated) {
    throw new Error("QEMU-Wasm requires cross-origin isolation.");
  }
  const module = configureModule();
  await loadScript("https://unpkg.com/xterm@5.3.0/lib/xterm.js");
  await loadScript("https://unpkg.com/xterm-pty/index.js");
  await Promise.all(["load-rootfs.js", "load-kernel.js", "load-initramfs.js", "load-rom.js"].map(loadScript));
  if (typeof window.Terminal !== "function" || typeof window.openpty !== "function") {
    throw new Error("QEMU-Wasm terminal dependencies did not load.");
  }
  const { default: initEmscriptenModule } = await import(`${DEMO_ROOT}out.js`);
  const terminal = new window.Terminal({ cursorBlink: true, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace", fontSize: 13, theme: { background: "#080c12", foreground: "#e6edf3" } });
  terminal.open($("terminal"));
  const { master, slave } = window.openpty();
  terminal.loadAddon(master);
  module.pty = slave;
  setStatus("loading", "booting Alpine…");
  const instance = await initEmscriptenModule(module);
  const poll = instance.TTY.stream_ops.poll;
  instance.TTY.stream_ops.poll = (stream, timeout) => !slave.readable ? (slave.writable ? 4 : 0) : poll.call(instance.TTY.stream_ops, stream, timeout);
  setStatus("ready", "QEMU running");
}

start().catch((error) => {
  console.error("QEMU Playground failed", error);
  setStatus("error", error.message || String(error));
});
