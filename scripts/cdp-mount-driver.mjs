// CDP driver primitives for cdp-mount-test.mjs (split out so neither
// file exceeds the 500-line budget). Drives a persistent headless Chrome
// instance over the DevTools protocol (port 9222, profile /tmp/gearshell-cdp).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { WebSocket } = require(
  "/Users/gear/Documents/GitHub/wanix/node_modules/ws",
);
import fs from "node:fs";

export const PORT = 9222;
export const APP = "http://127.0.0.1:8080/";

let chromeProc = null;
let ws = null;
let msgId = 0;
const pending = new Map();

export function connect(wsUrl) {
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

export function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

export async function evalJS(expr) {
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

export async function goto(url) {
  await send("Page.navigate", { url });
  await waitLoad();
}

export async function waitLoad() {
  for (let i = 0; i < 120; i++) {
    const state = await evalJS("document.readyState");
    if (state === "complete") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("page load timeout");
}

export async function waitFor(expr, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evalJS(expr)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`waitFor timeout: ${expr}`);
}

export async function screenshot(file) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log("saved", file);
}

export async function ensureChrome() {
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

export function killChrome() {
  chromeProc?.kill();
  return new Promise((r) => setTimeout(r, 300));
}

// Collect Runtime console messages until kill() is called; used by the
// console/repro/realpick commands to dump page logs.
export function collectConsole() {
  const logs = [];
  const listener = (data) => {
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
  };
  ws.on("message", listener);
  return {
    logs,
    kill() {
      ws.off("message", listener);
    },
  };
}

// Wait for the next Page.fileChooserOpened event (used by realpick).
export function waitForFileChooser(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const listener = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === "Page.fileChooserOpened") {
        ws.off("message", listener);
        resolve(msg.params);
      }
    };
    ws.on("message", listener);
    setTimeout(() => {
      ws.off("message", listener);
      resolve(null);
    }, timeoutMs);
  });
}
