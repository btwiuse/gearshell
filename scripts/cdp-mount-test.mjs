// Minimal CDP driver for testing the gearshell local-directory mount flow.
//
// Drives a headless Chrome over the DevTools protocol (CDP). It is a test
// harness, not a framework: each `node cdp-mount-test.mjs <command>` is a
// short-lived process that (re)connects to a persistent Chrome instance
// (port 9222, profile /tmp/gearshell-cdp) and keeps it alive between runs.
// CDP primitives live in ./cdp-mount-driver.mjs (500-line rule split).
//
// Prerequisites:
//   1. Serve the app:      python3 -m http.server 8080 (from the repo root)
//   2. Local wanix wasm:   ln -sfn <wanix>/dist wanix-dist  (repo root)
//   3. Point the workspace runtime at /wanix-dist/wanix.debug.wasm via
//      the `set-runtime` command once (persisted in localStorage); the
//      workspace config lives at gear-shell-workspace:<id> and the active
//      id at gear-shell-active-workspace (NOT gear-shell-config).
//
// Commands:
//   boot          launch chrome, open the app, wait for the wanix kernel
//   set-runtime   point the active workspace at the local debug wasm +
//                 open the Files panel on boot (restoreTabs), reload
//   clear-runtime remove the runtime override, fall back to the default
//   stub          reload the app and install a showDirectoryPicker stub
//                 that returns the OPFS root (skips the native picker)
//   click-mount   click the "Mount local directory" button (after stub)
//   check         readDir /mnt + write/read a file through the mount
//   fulltest      mount -> verify (no reload)
//   fulltest2     mount -> reload -> verify auto-restore -> unmount -> verify
//   eval <expr>   evaluate JS in the page and print the JSON result
//   console       navigate and dump page console/exception messages
//   repro         mount a stub subdir and dump filtered console output
//   realpick      intercept the real file chooser and mount a real dir
//   screenshot    save a PNG of the current tab
//   kill          stop the Chrome instance
import {
  APP,
  collectConsole,
  ensureChrome,
  evalJS,
  goto,
  killChrome,
  screenshot,
  send,
  waitFor,
  waitForFileChooser,
  waitLoad,
} from "./cdp-mount-driver.mjs";

const KERNEL_READY =
  "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true";
const MOUNT_BTN = 'button[aria-label="Mount local directory"]';

function kernelReady() {
  return waitFor(KERNEL_READY, 180000);
}

function mountButtonReady() {
  return waitFor(`!!document.querySelector('${MOUNT_BTN}')`, 60000);
}

function clickMount() {
  return evalJS(`(() => {
    const btn = document.querySelector('${MOUNT_BTN}');
    if (!btn) return "no button";
    btn.click();
    return "clicked";
  })()`);
}

function clickEject() {
  return evalJS(`(() => {
    const btn = document.querySelector('.files-volume-eject');
    if (!btn) return "no eject";
    btn.click();
    return "clicked-eject";
  })()`);
}

// showDirectoryPicker stub: return the OPFS root as "opfs-root", or a
// subdirectory of it (repro) — skips the native picker in headless.
function stubPickerScript(name) {
  if (name === "opfs-root") {
    return `(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          Object.defineProperty(root, "name", { value: "opfs-root" });
          return root;
        };
        return "stubbed";
      })()`;
  }
  return `(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          const sub = await root.getDirectoryHandle("${name}", { create: true });
          Object.defineProperty(sub, "name", { value: "${name}" });
          return sub;
        };
        return "stubbed-with-subdir";
      })()`;
}

function probeFulltest() {
  return `(async () => {
    const root = window.__wanix['1'].root;
    const j = (v) => JSON.stringify(v);
    const mnt = await root.readDir("mnt").catch(e => "ERR " + e);
    const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
    const write = await root.writeFile("mnt/opfs-root/cdp-test2.txt", "roundtrip-ok").then(() => "written").catch(e => "ERR " + String(e));
    const read = await root.readFile("mnt/opfs-root/cdp-test2.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + String(e));
    const ui = [...document.querySelectorAll(".files-list button")].map(b => b.textContent.trim()).slice(0, 12);
    const status = document.querySelector(".files-status")?.textContent || "";
    return j({ mnt, inner, write, read, ui, status });
  })()`;
}

function probePanelStatus() {
  return `(() => {
    const st = document.querySelector(".files-status");
    const vols = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
    return JSON.stringify({ status: st?.textContent || "", vols });
  })()`;
}

function probeAfterMount() {
  return `(async () => {
    const root = window.__wanix['1'].root;
    const j = (v) => JSON.stringify(v);
    const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
    const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
    const volsOff = document.querySelectorAll(".files-volume-off").length;
    return j({ inner, volumes, volsOff });
  })()`;
}

function probeAfterReload() {
  return `(async () => {
    const root = window.__wanix['1'].root;
    const j = (v) => JSON.stringify(v);
    const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
    const read = await root.readFile("mnt/opfs-root/cdp-test2.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + String(e));
    const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
    const volsOff = document.querySelectorAll(".files-volume-off").length;
    const tabs = [...document.querySelectorAll(".dv-tab")].map(t => t.textContent).slice(0, 6);
    return j({ inner, read, volumes, volsOff, tabs });
  })()`;
}

function probeAfterUnmount() {
  return `(async () => {
    const root = window.__wanix['1'].root;
    const j = (v) => JSON.stringify(v);
    const inner = await root.readDir("mnt/opfs-root").then(() => "STILL-MOUNTED").catch(e => "unmounted: " + String(e));
    const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
    return j({ inner, volumes });
  })()`;
}

function filterConsole(logs, pattern, maxChars) {
  return "CONSOLE (filtered):\n" +
    logs.filter((l) => pattern.test(l)).join("\n").slice(0, maxChars);
}

async function runFulltest2() {
  await ensureChrome();
  await goto(APP);
  await kernelReady();
  await mountButtonReady();
  await evalJS(stubPickerScript("opfs-root"));
  console.log(await clickMount());
  await new Promise((r) => setTimeout(r, 3000));
  console.log("AFTER MOUNT:", await evalJS(probeAfterMount()));
  // reload: auto-restore must re-bind from IDB
  await send("Page.reload", { ignoreCache: true });
  await waitLoad();
  await kernelReady();
  await waitFor("!!document.querySelector('.files-volumes')", 60000);
  await new Promise((r) => setTimeout(r, 2500));
  console.log("AFTER RELOAD:", await evalJS(probeAfterReload()));
  console.log(await clickEject());
  await new Promise((r) => setTimeout(r, 1500));
  console.log("AFTER UNMOUNT:", await evalJS(probeAfterUnmount()));
}

async function runRealPick(dir) {
  await ensureChrome();
  await goto(APP);
  await kernelReady();
  await mountButtonReady();
  const { chooser, collector } = await interceptFileChooser();
  await clickButtonCenter(MOUNT_BTN);
  await new Promise((r) => setTimeout(r, 1500));
  console.log("picker invoked:", await evalJS("window.__pickerInvoked"));
  const params = await chooser;
  if (!params) {
    console.log("NO CHOOSER EVENT");
    collector.kill();
    return;
  }
  console.log(
    "chooser mode:",
    params.mode,
    "backendNodeId:",
    params.backendNodeId,
  );
  await send("Page.handleFileChooser", { action: "accept", files: [dir] });
  await new Promise((r) => setTimeout(r, 6000));
  console.log("PANEL:", await evalJS(probePanelStatus()));
  console.log(filterConsole(
    collector.logs,
    /panic|fsa|localdir|setupNamespace|mount local|valueof/i,
    5000,
  ));
  collector.kill();
}

// Intercept the native directory picker and stub showDirectoryPicker so
// the mount flow can be driven headlessly. Returns the chooser promise +
// a console collector for the mount probes.
async function interceptFileChooser() {
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  const chooser = waitForFileChooser();
  const collector = collectConsole();
  await evalJS(`(() => {
      window.__pickerInvoked = 0;
      const orig = window.showDirectoryPicker;
      window.showDirectoryPicker = async (...a) => { window.__pickerInvoked++; return orig(...a); };
      return 1;
    })()`);
  return { chooser, collector };
}

// Dispatch a left click at the center of a page element (CDP input
// events, so no real cursor movement is needed).
async function clickButtonCenter(selector) {
  const rect = await evalJS(`(() => {
    const r = document.querySelector('${selector}').getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  const { x, y } = JSON.parse(rect);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

// One command per top-level case, so the dispatcher stays a thin table.
async function cmdBoot() {
  await ensureChrome();
  await goto(APP);
  // point runtime at the locally-built debug wasm
  const cfg = await evalJS(`(() => {
    const raw = localStorage.getItem("gear-shell-config");
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c.workspace) return c;
    const ws = Array.isArray(c.workspace) ? c.workspace : [c.workspace];
    const target = ws.find(w => w && (w.runtime || !Array.isArray(c.workspace)));
    (target || (c.workspace)).runtime = (target || c.workspace).runtime || {};
    const t = target || c.workspace;
    t.runtime.wasmUrl = "/wanix-dist/wanix.debug.wasm";
    localStorage.setItem("gear-shell-config", JSON.stringify(c));
    return JSON.stringify(t.runtime);
  })()`);
  console.log("runtime config set:", cfg);
  await send("Page.reload", { ignoreCache: true });
  await waitLoad();
  await kernelReady();
  console.log("wanix kernel ready");
}

async function cmdEval(args) {
  await ensureChrome();
  await goto(APP);
  console.log(await evalJS(args.join(" ")));
}

async function cmdSetRuntime() {
  await ensureChrome();
  await goto(APP);
  await evalJS(`(() => {
    const id = localStorage.getItem("gear-shell-active-workspace");
    const key = "gear-shell-workspace:" + id;
    const ws = JSON.parse(localStorage.getItem(key));
    ws.runtime = ws.runtime || {};
    ws.runtime.wasmUrl = "/wanix-dist/wanix.debug.wasm";
    ws.ui = ws.ui || {};
    ws.ui.openPanels = [{ component: "files", panelId: "files-1" }];
    ws.shell = ws.shell || {};
    ws.shell.restoreTabs = true;
    localStorage.setItem(key, JSON.stringify(ws));
    const raw = localStorage.getItem("gear-shell-config");
    const c = raw ? JSON.parse(raw) : {};
    c.restoreTabs = true;
    localStorage.setItem("gear-shell-config", JSON.stringify(c));
    return JSON.stringify({ id, runtime: ws.runtime, restoreTabs: ws.shell.restoreTabs, openPanels: ws.ui.openPanels });
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitLoad();
  await kernelReady();
  console.log("wanix kernel ready with local wasm");
}

async function cmdClearRuntime() {
  await ensureChrome();
  await goto(APP);
  await evalJS(`(() => {
    const id = localStorage.getItem("gear-shell-active-workspace");
    const key = "gear-shell-workspace:" + id;
    const ws = JSON.parse(localStorage.getItem(key));
    ws.runtime = {};
    localStorage.setItem(key, JSON.stringify(ws));
    return "cleared, falling back to WANIX_RUNTIME default";
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitLoad();
  await kernelReady();
  console.log(
    "kernel ready, wasm:",
    await evalJS(
      "document.querySelector('#wanix-system').getAttribute('wasm')",
    ),
  );
}

async function cmdStub() {
  await ensureChrome();
  await goto(APP);
  console.log(await evalJS(stubPickerScript("opfs-root")));
}

async function cmdClickMount() {
  await ensureChrome();
  await mountButtonReady();
  console.log(await clickMount());
}

async function cmdCheck() {
  await ensureChrome();
  console.log(
    await evalJS(`(async () => {
    const kernel = window.__wanix['1'];
    if (!kernel || !kernel.isReady) return "kernel not ready";
    const root = kernel.root;
    const ls = (p) => root.readDir(p);
    const mnt = await ls("mnt").then(es => es.map(e => e.name)).catch(e => "ERR " + e.message);
    const mounted = await ls("mnt/opfs-root").then(es => es.map(e => e.name)).catch(e => "ERR " + e.message);
    const write = await root.writeFile("mnt/opfs-root/cdp-test.txt", "hello-from-cdp").then(() => "written").catch(e => "ERR " + e.message);
    const read = await root.readFile("mnt/opfs-root/cdp-test.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + e.message);
    return JSON.stringify({ mnt, mounted, write, read });
  })()`),
  );
}

async function cmdFulltest() {
  await ensureChrome();
  await goto(APP);
  await kernelReady();
  await mountButtonReady();
  await evalJS(stubPickerScript("opfs-root"));
  console.log(await clickMount());
  await new Promise((r) => setTimeout(r, 3000));
  console.log(await evalJS(probeFulltest()));
}

async function cmdFulltest2() {
  await runFulltest2();
}

async function cmdConsole() {
  await ensureChrome();
  const collector = collectConsole();
  await goto(APP);
  await new Promise((r) => setTimeout(r, 25000));
  console.log(collector.logs.slice(0, 40).join("\n"));
  collector.kill();
}

async function cmdRepro() {
  await ensureChrome();
  await goto(APP);
  await kernelReady();
  await mountButtonReady();
  const collector = collectConsole();
  await evalJS(stubPickerScript("repro-dir"));
  console.log(await clickMount());
  await new Promise((r) => setTimeout(r, 4000));
  console.log("PANEL:", await evalJS(probePanelStatus()));
  console.log(filterConsole(
    collector.logs,
    /panic|fsa|localdir|setupNamespace|mount local/i,
    4000,
  ));
  collector.kill();
}

async function cmdRealpick(args) {
  await runRealPick(args[0] || "/Users/gear/Documents/GitHub/wanix");
}

async function cmdScreenshot(args) {
  await ensureChrome();
  await screenshot(args[0] || "/tmp/gearshell.png");
}

async function cmdKill() {
  await killChrome();
  process.exit(0);
}

const COMMANDS = {
  boot: cmdBoot,
  eval: cmdEval,
  "set-runtime": cmdSetRuntime,
  "clear-runtime": cmdClearRuntime,
  stub: cmdStub,
  "click-mount": cmdClickMount,
  check: cmdCheck,
  fulltest: cmdFulltest,
  fulltest2: cmdFulltest2,
  console: cmdConsole,
  repro: cmdRepro,
  realpick: cmdRealpick,
  screenshot: cmdScreenshot,
  kill: cmdKill,
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const run = COMMANDS[cmd];
  if (!run) {
    console.log("unknown command", cmd);
    process.exit(1);
  }
  await run(args);
  // keep the browser alive across commands; exit only this driver process
  await new Promise((r) => setTimeout(r, 800));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  killChrome().then(() => process.exit(1));
});
