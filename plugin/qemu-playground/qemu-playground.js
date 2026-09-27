const DEMO_ROOT = "/plugin/qemu-playground/vendor/";
const VNET_URL = "wss://vnet.net.k0s.io/x/net";
const $ = (id) => document.getElementById(id);
const status = $("status");

// Side-effect import: installs window.GearShell.vnet (the host-side
// helper that speaks vnet /x/net WebSocket) before any code path
// touches it.
import "./vnet-bridge.js";

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
    // -netdev wsmux forwards L2 frames through Module.wsmuxBridge
    // (created in installWsmuxBridge below) into window.GearShell.vnet
    // which speaks the vnet /x/net WebSocket protocol (raw L2 per
    // WS binary message in both directions, matching gearshell/vnet,
    // apptron/worker, and progrium/go-netstack).
    "-netdev", `wsmux,id=vmnic,url=${VNET_URL},bridge=wsmuxBridge`,
    "-device", "virtio-net-pci,netdev=vmnic",
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
  await Promise.all(["load-rootfs.js", "load-kernel.js", "load-initramfs.js", "load-rom.js"].map(loadScript));
  if (typeof window.Terminal !== "function" || typeof window.openpty !== "function") {
    throw new Error("QEMU-Wasm terminal dependencies did not load.");
  }
  if (module.network && !window.GearShell?.vnet) {
    throw new Error("vnet-bridge did not load; GearShell.vnet is missing.");
  }
  if (module.network) setNetwork(true);
  else setNetwork(false);
  // openpty returns { master, slave }; the slave is what out.js reads
  // as Module["pty"] inside initRuntime(), which runs as part of
  // Module.onRuntimeInitialized (resolved by loadQemuModule below).
  // Wire the slave up *before* loadQemuModule awaits the runtime
  // hook so PTY.onSignal etc. find Module["pty"] populated.
  const { master, slave } = window.openpty();
  module.pty = slave;
  const instance = await loadQemuModule();
  const terminal = new window.Terminal({ cursorBlink: true, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace", fontSize: 13, theme: { background: "#080c12", foreground: "#e6edf3" } });
  terminal.open($("terminal"));
  terminal.loadAddon(master);
  setStatus("loading", module.network ? "booting Alpine with vnet networking…" : "booting Alpine…");
  const poll = instance.TTY.stream_ops.poll;
  instance.TTY.stream_ops.poll = (stream, timeout) => !slave.readable ? (slave.writable ? 4 : 0) : poll.call(instance.TTY.stream_ops, stream, timeout);
  setStatus("ready", module.network ? "QEMU running · vnet attached" : "QEMU running");
}

// Module.wsmuxBridge — host-side helper that the qemu-wasm fork calls
// when the wsmux netdev is wired up. The wasm side invokes:
//   bridge.connect(url)             -> handle
//   bridge.send(handle, bytes)      -> emits a raw L2 frame
//   bridge.recv(handle, callback)   -> subscribes to incoming frames
//   bridge.close(handle)            -> tears down
// Frames are raw L2 per JS call (one frame per `send`/`recv`); the
// bridge queues them, and the vnet-bridge module drives
// `wss://vnet.net.k0s.io/x/net` (one raw L2 frame per WebSocket
// binary message in both directions — matching the upstream
// gearshell/vnet, apptron/worker, and progrium/go-netstack
// gateway). 4-byte BE length prefixing is intentionally absent:
// that prefix is purely the server-side adapter framing inside
// `vnet.AcceptQemu` and never appears on the wire.
function installWsmuxBridge(module) {
  module.wsmuxBridge = createVnetWsmuxBridge();
  // Sanity: the qemu-wasm fork's js_wsmux_open needs Module["wsmuxBridge"]
  // with a .connect(url) function. The "did not accept url" error from
  // qemu-system-x86_64 means it didn't find that shape; this log is
  // here to confirm the bridge is in place if the error recurs.
  console.log("[qemu-playground] Module.wsmuxBridge keys:",
    Object.keys(module.wsmuxBridge),
    "connect is fn?", typeof module.wsmuxBridge.connect === "function",
    "window.Module is module?", window.Module === module);
  // Self-test: invoke connect once now so the user can see in
  // devtools whether the bridge round-trips before out.js ever
  // touches it. We immediately close the handle so the test does
  // not actually open a WebSocket.
  try {
    const probe = module.wsmuxBridge.connect("ws://probe.invalid/");
    console.log("[qemu-playground] probe connect returned", probe,
      "typeof probe:", typeof probe);
    if (probe) module.wsmuxBridge.close(probe);
  } catch (err) {
    console.warn("[qemu-playground] probe connect threw", err);
  }
  // out.js sees Module via its own top-level `var Module = ...`
  // and `Module["wsmuxBridge"]` for js_wsmux_open. If the wasm
  // still reports "did not accept url" after the probe succeeds,
  // out.js is reading a different Module object than we set.
  console.log("[qemu-playground] before out.js load:",
    "globalThis.Module === window.Module === module?",
    globalThis.Module === module,
    "globalThis.Module keys:",
    Object.keys(globalThis.Module).slice(0, 20));
}

// Per-handle state for the wsmux bridge. Each entry owns an outbound
// queue (frames the wasm has yet to consume via recv) and at most one
// outstanding waiter (the most recent recv's resolve + disposer).
function createWsmuxBridgeEntry(url) {
  return { url, queue: [], waiting: null };
}

// Pump a freshly-delivered frame into the bridge's queue or the live
// waiter. Called by vnet-bridge.js's onFrame callback.
function pumpWsmuxFrame(handles, handle, frame) {
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

function createVnetWsmuxBridge() {
  const handles = new Map();
  let nextHandle = 1;

  return {
    connect(url) {
      const handle = nextHandle++;
      handles.set(handle, createWsmuxBridgeEntry(url));
      vnetAttach(handle, url, (frame) => pumpWsmuxFrame(handles, handle, frame));
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
      // Register a single-waiter slot. The wasm side invokes recv
      // sequentially in wsmux_recv_co, so overwriting `waiting` is
      // safe (previous disposers null it out, so callbacks never fire
      // twice for the same handle).
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
      if (entry?.waiting?.dispose) entry.waiting.dispose();
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
