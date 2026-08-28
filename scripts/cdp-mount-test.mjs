// Minimal CDP driver for testing the gearshell local-directory mount flow.
//
// Drives a headless Chrome over the DevTools protocol (CDP). It is a test
// harness, not a framework: each `node cdp-mount-test.mjs <command>` is a
// short-lived process that (re)connects to a persistent Chrome instance
// (port 9222, profile /tmp/gearshell-cdp) and keeps it alive between runs.
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
//   stub          reload the app and install a showDirectoryPicker stub
//                 that returns the OPFS root (skips the native picker)
//   click-mount   click the "Mount local directory" button (after stub)
//   check         readDir /mnt + write/read a file through the mount
//   fulltest      mount -> verify (no reload)
//   fulltest2     mount -> reload -> verify auto-restore -> unmount -> verify
//   eval <expr>   evaluate JS in the page and print the JSON result
//   console       navigate and dump page console/exception messages
//   screenshot    save a PNG of the current tab
//   kill          stop the Chrome instance
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { WebSocket } = require(
  "/Users/gear/Documents/GitHub/wanix/node_modules/ws",
);
import fs from "node:fs";

const PORT = 9222;
const APP = "http://127.0.0.1:8080/";

let chromeProc = null;
let ws = null;
let msgId = 0;
const pending = new Map();

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(wsUrl);
    ws.on("open", () => resolve());
    ws.on("error", reject);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  });
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJS(expr) {
  const res = await send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(
      "eval exception: " +
        JSON.stringify(
          res.exceptionDetails.exception?.description || res.exceptionDetails,
        ),
    );
  }
  return res.result?.value;
}

async function launch() {
  chromeProc = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=/tmp/gearshell-cdp",
      "--no-first-run",
      "--disable-gpu",
      "--window-size=1400,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  // wait for debugging endpoint
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
}

async function goto(url) {
  await send("Page.navigate", { url });
  await waitLoad();
}

async function waitLoad() {
  for (let i = 0; i < 120; i++) {
    const state = await evalJS("document.readyState");
    if (state === "complete") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("page load timeout");
}

async function waitFor(expr, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evalJS(expr)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`waitFor timeout: ${expr}`);
}

async function screenshot(file) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log("saved", file);
}

async function ensureChrome() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (r.ok && ws) return;
    if (r.ok) {
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        await connect(page.webSocketDebuggerUrl);
        return;
      }
    }
  } catch {}
  await launch();
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "boot": {
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
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      console.log("wanix kernel ready");
      break;
    }
    case "eval": {
      await ensureChrome();
      await goto(APP);
      console.log(await evalJS(args.join(" ")));
      break;
    }
    case "set-runtime": {
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
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      console.log("wanix kernel ready with local wasm");
      break;
    }
    case "clear-runtime": {
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
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      console.log(
        "kernel ready, wasm:",
        await evalJS(
          "document.querySelector('#wanix-system').getAttribute('wasm')",
        ),
      );
      break;
    }
    case "stub": {
      await ensureChrome();
      await goto(APP);
      console.log(
        await evalJS(`(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          Object.defineProperty(root, "name", { value: "opfs-root" });
          return root;
        };
        return "stubbed";
      })()`),
      );
      break;
    }
    case "click-mount": {
      await ensureChrome();
      await waitFor(
        "!!document.querySelector('button[aria-label=\"Mount local directory\"]')",
        60000,
      );
      console.log(
        await evalJS(`(() => {
        const btn = document.querySelector('button[aria-label="Mount local directory"]');
        if (!btn) return "no button";
        btn.click();
        return "clicked";
      })()`),
      );
      break;
    }
    case "check": {
      await ensureChrome();
      const out = await evalJS(`(async () => {
        const kernel = window.__wanix['1'];
        if (!kernel || !kernel.isReady) return "kernel not ready";
        const root = kernel.root;
        const ls = (p) => root.readDir(p);
        const mnt = await ls("mnt").then(es => es.map(e => e.name)).catch(e => "ERR " + e.message);
        const mounted = await ls("mnt/opfs-root").then(es => es.map(e => e.name)).catch(e => "ERR " + e.message);
        const write = await root.writeFile("mnt/opfs-root/cdp-test.txt", "hello-from-cdp").then(() => "written").catch(e => "ERR " + e.message);
        const read = await root.readFile("mnt/opfs-root/cdp-test.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + e.message);
        return JSON.stringify({ mnt, mounted, write, read });
      })()`);
      console.log(out);
      break;
    }
    case "fulltest": {
      await ensureChrome();
      await goto(APP);
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      await waitFor(
        "!!document.querySelector('button[aria-label=\"Mount local directory\"]')",
        60000,
      );
      await evalJS(`(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          Object.defineProperty(root, "name", { value: "opfs-root" });
          return root;
        };
        return "stubbed";
      })()`);
      console.log(
        await evalJS(`(() => {
        const btn = document.querySelector('button[aria-label="Mount local directory"]');
        if (!btn) return "no button";
        btn.click();
        return "clicked";
      })()`),
      );
      await new Promise((r) => setTimeout(r, 3000));
      const out = await evalJS(`(async () => {
        const root = window.__wanix['1'].root;
        const j = (v) => JSON.stringify(v);
        const mnt = await root.readDir("mnt").catch(e => "ERR " + e);
        const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
        const write = await root.writeFile("mnt/opfs-root/cdp-test2.txt", "roundtrip-ok").then(() => "written").catch(e => "ERR " + String(e));
        const read = await root.readFile("mnt/opfs-root/cdp-test2.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + String(e));
        const ui = [...document.querySelectorAll(".files-list button")].map(b => b.textContent.trim()).slice(0, 12);
        const status = document.querySelector(".files-status")?.textContent || "";
        return j({ mnt, inner, write, read, ui, status });
      })()`);
      console.log(out);
      break;
    }
    case "fulltest2": {
      await ensureChrome();
      await goto(APP);
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      await waitFor(
        "!!document.querySelector('button[aria-label=\"Mount local directory\"]')",
        60000,
      );
      // mount OPFS root as a "volume"
      await evalJS(`(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          Object.defineProperty(root, "name", { value: "opfs-root" });
          return root;
        };
        return "stubbed";
      })()`);
      await evalJS(
        `(() => { document.querySelector('button[aria-label="Mount local directory"]').click(); return "clicked"; })()`,
      );
      await new Promise((r) => setTimeout(r, 3000));
      const afterMount = await evalJS(`(async () => {
        const root = window.__wanix['1'].root;
        const j = (v) => JSON.stringify(v);
        const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
        const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
        const volsOff = document.querySelectorAll(".files-volume-off").length;
        return j({ inner, volumes, volsOff });
      })()`);
      console.log("AFTER MOUNT:", afterMount);
      // reload: auto-restore must re-bind from IDB
      await send("Page.reload", { ignoreCache: true });
      await waitLoad();
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      await waitFor("!!document.querySelector('.files-volumes')", 60000);
      await new Promise((r) => setTimeout(r, 2500));
      const afterReload = await evalJS(`(async () => {
        const root = window.__wanix['1'].root;
        const j = (v) => JSON.stringify(v);
        const inner = await root.readDir("mnt/opfs-root").catch(e => "ERR " + String(e));
        const read = await root.readFile("mnt/opfs-root/cdp-test2.txt").then(b => new TextDecoder().decode(b)).catch(e => "ERR " + String(e));
        const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
        const volsOff = document.querySelectorAll(".files-volume-off").length;
        const tabs = [...document.querySelectorAll(".dv-tab")].map(t => t.textContent).slice(0, 6);
        return j({ inner, read, volumes, volsOff, tabs });
      })()`);
      console.log("AFTER RELOAD:", afterReload);
      // unmount via eject button
      const eject = await evalJS(`(() => {
        const btn = document.querySelector('.files-volume-eject');
        if (!btn) return "no eject";
        btn.click();
        return "clicked-eject";
      })()`);
      console.log(eject);
      await new Promise((r) => setTimeout(r, 1500));
      const afterUnmount = await evalJS(`(async () => {
        const root = window.__wanix['1'].root;
        const j = (v) => JSON.stringify(v);
        const inner = await root.readDir("mnt/opfs-root").then(() => "STILL-MOUNTED").catch(e => "unmounted: " + String(e));
        const volumes = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
        return j({ inner, volumes });
      })()`);
      console.log("AFTER UNMOUNT:", afterUnmount);
      break;
    }
    case "console": {
      await ensureChrome();
      const logs = [];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (
          msg.method === "Runtime.consoleAPICalled" ||
          msg.method === "Runtime.exceptionThrown"
        ) {
          const text = msg.method === "Runtime.exceptionThrown"
            ? "EXC: " +
              JSON.stringify(
                msg.params.exceptionDetails?.exception?.description ||
                  msg.params.exceptionDetails?.text,
              )
            : msg.params.args.map((a) => a.value ?? a.description ?? a.type)
              .join(" ");
          logs.push(text);
        }
      });
      await goto(APP);
      await new Promise((r) => setTimeout(r, 25000));
      console.log(logs.slice(0, 40).join("\n"));
      break;
    }
    case "repro": {
      await ensureChrome();
      await goto(APP);
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      await waitFor(
        "!!document.querySelector('button[aria-label=\"Mount local directory\"]')",
        60000,
      );
      const logs = [];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "Runtime.consoleAPICalled") {
          const text = msg.params.args.map((a) =>
            a.value ?? a.description ?? a.type
          ).join(" ");
          logs.push(text);
        }
      });
      await evalJS(`(() => {
        window.__realShowDirectoryPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async (opts) => {
          const root = await navigator.storage.getDirectory();
          const sub = await root.getDirectoryHandle("repro-dir", { create: true });
          Object.defineProperty(sub, "name", { value: "repro-dir" });
          return sub;
        };
        return "stubbed-with-subdir";
      })()`);
      await evalJS(
        `(() => { document.querySelector('button[aria-label="Mount local directory"]').click(); return "clicked"; })()`,
      );
      await new Promise((r) => setTimeout(r, 4000));
      const status = await evalJS(`(() => {
        const st = document.querySelector(".files-status");
        const vols = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
        return JSON.stringify({ status: st?.textContent || "", vols });
      })()`);
      console.log("PANEL:", status);
      console.log(
        "CONSOLE (filtered):\n" +
          logs.filter((l) =>
            /panic|fsa|localdir|setupNamespace|mount local/i.test(l)
          ).join("\n").slice(0, 4000),
      );
      break;
    }
    case "realpick": {
      const dir = process.argv[3] || "/Users/gear/Documents/GitHub/wanix";
      await ensureChrome();
      await goto(APP);
      await waitFor(
        "!!window.__wanix && !!window.__wanix['1'] && window.__wanix['1'].isReady === true",
        180000,
      );
      await waitFor(
        "!!document.querySelector('button[aria-label=\"Mount local directory\"]')",
        60000,
      );
      await send("Page.setInterceptFileChooserDialog", { enabled: true });
      const chooser = new Promise((resolve) => {
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.method === "Page.fileChooserOpened") resolve(msg.params);
        });
      });
      const logs = [];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "Runtime.consoleAPICalled") {
          const text = msg.params.args.map((a) =>
            a.value ?? a.description ?? a.type
          ).join(" ");
          logs.push(text);
        }
      });
      await evalJS(
        `(() => { window.__pickerInvoked = 0; const orig = window.showDirectoryPicker; window.showDirectoryPicker = async (...a) => { window.__pickerInvoked++; return orig(...a); }; return 1; })()`,
      );
      const rect = await evalJS(`(() => {
        const r = document.querySelector('button[aria-label="Mount local directory"]').getBoundingClientRect();
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
      await new Promise((r) => setTimeout(r, 1500));
      const invoked = await evalJS("window.__pickerInvoked");
      console.log("picker invoked:", invoked);
      const params = await Promise.race([
        chooser,
        new Promise((r) => setTimeout(() => r(null), 8000)),
      ]);
      if (!params) {
        console.log("NO CHOOSER EVENT");
        break;
      }
      console.log(
        "chooser mode:",
        params.mode,
        "backendNodeId:",
        params.backendNodeId,
      );
      await send("Page.handleFileChooser", { action: "accept", files: [dir] });
      await new Promise((r) => setTimeout(r, 6000));
      const status = await evalJS(`(() => {
        const st = document.querySelector(".files-status");
        const vols = [...document.querySelectorAll(".files-volume-name span")].map(s => s.textContent);
        return JSON.stringify({ status: st?.textContent || "", vols });
      })()`);
      console.log("PANEL:", status);
      console.log(
        "CONSOLE (filtered):\n" +
          logs.filter((l) =>
            /panic|fsa|localdir|setupNamespace|mount local|valueof/i.test(l)
          ).join("\n").slice(0, 5000),
      );
      break;
    }
    case "screenshot": {
      await ensureChrome();
      await screenshot(args[0] || "/tmp/gearshell.png");
      break;
    }
    case "kill": {
      chromeProc?.kill();
      await new Promise((r) => setTimeout(r, 300));
      process.exit(0);
    }
    default:
      console.log("unknown command", cmd);
      process.exit(1);
  }
  // keep the browser alive across commands; exit only this driver process
  await new Promise((r) => setTimeout(r, 800));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  chromeProc?.kill();
  process.exit(1);
});
