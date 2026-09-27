const DEMO_ROOT = "/plugin/qemu-playground/vendor/";
const $ = (id) => document.getElementById(id);
const status = $("status");

function setStatus(mode, text) {
  status.dataset.mode = mode;
  status.textContent = text;
}

function setNetwork(on) {
  status.dataset.net = on ? "on" : "off";
}

function loadScript(name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${DEMO_ROOT}${name}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${name}.`));
    document.head.append(script);
  });
}

function loadQemuModule() {
  return new Promise((resolve, reject) => {
    // The qemu-wasm out.js ships as a classic script that auto-runs
    // Module. We've already populated window.Module in configureModule();
    // we only need to wait for it to finish booting before returning so
    // the rest of start() can wire up xterm/PTY hooks against the live
    // runtime. out.js calls Module.onRuntimeInitialized once the WASM
    // module is ready, and Module.calledRun flips true on completion.
    const module = window.Module;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(module);
    };
    module.onRuntimeInitialized = finish;
    const script = document.createElement("script");
    script.src = `${DEMO_ROOT}out.js`;
    script.onerror = () => reject(new Error("Could not load out.js"));
    document.head.append(script);
    if (module.calledRun) queueMicrotask(finish);
  });
}

function configureModule() {
  const module = window.Module || {};
  module.preRun = module.preRun || [];
  const network = $("net").checked;
  module.arguments = network ? [
    "-nographic", "-M", "pc", "-m", "512M", "-accel", "tcg,tb-size=500",
    "-L", "/pack-rom/", "-kernel", "/pack-kernel/vmlinuz-virt",
    "-initrd", "/pack-initramfs/initramfs-virt", "-append", "console=ttyS0 root=/dev/vda noautodetect hostname=qemu-playground",
    "-drive", "id=rootfs,file=/pack-rootfs/disk-rootfs.img,format=raw,if=none",
    "-device", "virtio-blk-pci,drive=rootfs",
    "-virtfs", "local,path=/.wasmenv,mount_tag=wasm0,security_model=passthrough,id=wasm0",
    "-netdev", "socket,id=vmnic,connect=localhost:9999", "-device", "virtio-net-pci,netdev=vmnic",
  ] : [
    "-nographic", "-M", "pc", "-m", "512M", "-accel", "tcg,tb-size=500",
    "-L", "/pack-rom/", "-nic", "none", "-kernel", "/pack-kernel/vmlinuz-virt",
    "-initrd", "/pack-initramfs/initramfs-virt", "-append", "console=ttyS0 root=/dev/vda noautodetect hostname=qemu-playground",
    "-drive", "id=rootfs,file=/pack-rootfs/disk-rootfs.img,format=raw,if=none",
    "-device", "virtio-blk-pci,drive=rootfs",
  ];
  module.locateFile = (path) => `${DEMO_ROOT}${path}`;
  module.mainScriptUrlOrBlob = `${DEMO_ROOT}out.js`;
  module.network = network;
  window.Module = module;
  installWsmuxBridge(module);
  return module;
}

async function start() {
  if (!window.crossOriginIsolated) {
    throw new Error("QEMU-Wasm requires cross-origin isolation.");
  }
  const module = configureModule();
  await loadScript("xterm.js");
  await loadScript("xterm-pty.js");
  if (module.network) await loadScript("network/stack.js");
  await Promise.all(["load-rootfs.js", "load-kernel.js", "load-initramfs.js", "load-rom.js"].map(loadScript));
  if (typeof window.Terminal !== "function" || typeof window.openpty !== "function") {
    throw new Error("QEMU-Wasm terminal dependencies did not load.");
  }
  let certificate = null;
  if (module.network) {
    if (!window.Stack) throw new Error("QEMU-Wasm networking stack did not load.");
    setStatus("loading", "starting browser network…");
    certificate = await new Promise((resolve) => {
      module.websocket = { url: "http://localhost:9999/" };
      window.Stack.Start(
        "http://localhost:9999/",
        `${DEMO_ROOT}network/stack-worker.js`,
        `${DEMO_ROOT}network/c2w-net-proxy.wasm.gzip`,
        resolve,
      );
    });
    module.preRun.push((runtime) => {
      runtime.FS.mkdir("/.wasmenv");
      runtime.FS.writeFile("/.wasmenv/proxy.crt", certificate);
    });
    setNetwork(true);
  } else {
    setNetwork(false);
  }
  const instance = await loadQemuModule();
  const terminal = new window.Terminal({ cursorBlink: true, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace", fontSize: 13, theme: { background: "#080c12", foreground: "#e6edf3" } });
  terminal.open($("terminal"));
  const { master, slave } = window.openpty();
  terminal.loadAddon(master);
  module.pty = slave;
  setStatus("loading", "booting Alpine with browser networking…");
  const poll = instance.TTY.stream_ops.poll;
  instance.TTY.stream_ops.poll = (stream, timeout) => !slave.readable ? (slave.writable ? 4 : 0) : poll.call(instance.TTY.stream_ops, stream, timeout);
  setStatus("ready", "QEMU running");
}

// Module.wsmuxBridge — host-side helper that the qemu-wasm fork calls when
// the wsmux netdev is wired up. The bridge is only invoked if the guest
// is started with `-netdev wsmux,url=...`; with the current stub binary
// it stays unused. Frames are framed as "qemu": a 4-byte big-endian
// length prefix followed by a raw L2 payload.
function installWsmuxBridge(module) {
  module.wsmuxBridge = createVnetWsmuxBridge();
}

function createVnetWsmuxBridge() {
  const handles = new Map();
  let nextHandle = 1;

  function pumpFrame(handle, frame) {
    const entry = handles.get(handle);
    if (!entry) return;
    if (entry.waiting) {
      const { resolve, dispose } = entry.waiting;
      entry.waiting = null;
      if (dispose) dispose();
      resolve(frame);
    } else {
      entry.queue.push(frame);
    }
  }

  return {
    connect(url) {
      const handle = nextHandle++;
      handles.set(handle, { url, queue: [], waiting: null });
      vnetAttach(handle, url, (frame) => pumpFrame(handle, frame));
      return handle;
    },
    send(handle, bytes) {
      vnetSend(handle, new Uint8Array(bytes));
    },
    recv(handle, callback) {
      const entry = handles.get(handle);
      if (!entry) {
        callback(new Uint8Array(0));
        return () => {};
      }
      if (entry.queue.length) {
        const frame = entry.queue.shift();
        queueMicrotask(() => callback(frame));
        return () => {};
      }
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const dispose = () => {
        if (entry.waiting && entry.waiting.resolve === resolve) {
          entry.waiting = null;
        }
      };
      entry.waiting = { resolve, dispose };
      promise.then((frame) => callback(frame));
      return dispose;
    },
    close(handle) {
      const entry = handles.get(handle);
      if (entry && entry.waiting && entry.waiting.dispose) entry.waiting.dispose();
      handles.delete(handle);
      vnetDetach(handle).catch(() => {});
    },
  };
}

async function vnetAttach(handle, url, onFrame) {
  const vnet = window.GearShell?.vnet;
  if (!vnet?.attach) {
    console.warn("GearShell.vnet is not available; wsmux bridge running in dry-run mode");
    return;
  }
  await vnet.attach({ handle, url, onFrame });
}

async function vnetSend(handle, frame) {
  const vnet = window.GearShell?.vnet;
  if (!vnet?.send) return;
  await vnet.send(handle, frame);
}

async function vnetDetach(handle) {
  const vnet = window.GearShell?.vnet;
  if (!vnet?.detach) return;
  await vnet.detach(handle);
}

start().catch((error) => {
  console.error("QEMU Playground failed", error);
  setStatus("error", error.message || String(error));
});
