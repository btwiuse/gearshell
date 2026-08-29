// app-w9y-registry.js — thin GearShell side of the w9y install registry.
//
// The registry itself is OWNED and WRITTEN by the w9y CLI: `w9y mod
// apply` records every installed mod in w9y-registry.json at the install
// prefix root (opfs/wanix/w9y-registry.json == /opfs/wanix/w9y-registry.json
// inside tasks). GearShell deliberately does not bookkeep - it only
// orchestrates installs (headless `w9y mod apply` / `mod remove` tasks)
// and mirrors the file in memory for the synchronous jsfs surface
// (window.GearShell.w9y.list/status). The mirror is refreshed at boot,
// after each orchestrated operation, and on demand via w9y.refresh.

import { pushEvent } from "./workspace-events.js?v=20260828.4";
import { runHeadlessTask } from "./workspace-tasks-api.js?v=20260828.102";

const REGISTRY_OPFS = ["wanix", "w9y-registry.json"];
const INSTALL_PREFIX = "/opfs/wanix";

let mirror = { version: 1, mods: {} };
let refreshPromise = null;

async function readRegistryFile() {
  let dir = await navigator.storage.getDirectory();
  for (const part of REGISTRY_OPFS.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part);
  }
  const handle = await dir.getFileHandle(REGISTRY_OPFS.at(-1));
  return JSON.parse(await (await handle.getFile()).text());
}

// Re-read w9y's registry file into the in-memory mirror. Idempotent:
// concurrent callers share one read.
export function refreshW9yRegistry() {
  if (!refreshPromise) {
    refreshPromise = readRegistryFile()
      .then((reg) => {
        mirror = reg?.mods ? reg : { version: 1, mods: {} };
      })
      .catch(() => {
        mirror = { version: 1, mods: {} };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Boot hook: warm the mirror so w9y.list/status answer after boot.
export function loadW9yRegistry() {
  return refreshW9yRegistry();
}

// --- sync queries (safe for the jsfs surface) ---

export function listInstalledMods() {
  return Object.entries(mirror.mods || {}).map(([id, mod]) => ({
    id,
    version: mod.version,
    installedAt: mod.installedAt,
    entryCount: Object.keys(mod.entries || {}).length,
  }));
}

export function installedModStatus(id) {
  const mod = mirror.mods?.[id];
  if (!mod) return { id, installed: null, entryCount: 0 };
  return {
    id,
    installed: mod.version,
    installedAt: mod.installedAt,
    entryCount: Object.keys(mod.entries || {}).length,
  };
}

// --- orchestration (the w9y CLI does the install + bookkeeping) ---

const POLL_MS = 1000;
const MAX_WAIT_MS = 8 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readRegistryMods() {
  try {
    const reg = await readRegistryFile();
    return reg?.mods || {};
  } catch {
    return null; // registry file not written yet
  }
}

// The completion signal is w9y's own registry file: the CLI writes it
// LAST (atomically, after every entry), so the mod's record changing
// there (present for a fresh install, updated installedAt on re-apply,
// gone on remove) means the operation finished - independent of the
// task status-event chain, which can lag under load.
async function waitForRegistryModChanged(name) {
  const before = await readRegistryMods();
  const snapshot = JSON.stringify(before?.[name] || null);
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const mods = await readRegistryMods();
    // Value compare: fresh JSON.parse objects are never referentially
    // equal, so serialize both sides before comparing.
    if (mods && JSON.stringify(mods[name] || null) !== snapshot) return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function runW9yModAndWait(cmd, name) {
  // runHeadlessTask manages the task lifecycle (and destroys the
  // session); the registry wait is the real completion detector.
  const taskResult = runHeadlessTask(
    { cmd: `${cmd} --prefix ${INSTALL_PREFIX}`, env: "" },
    { timeoutMs: MAX_WAIT_MS },
  );
  const registryDone = waitForRegistryModChanged(name).then(() => ({
    ok: true,
  }));
  // Promise.race settles with the FIRST value (not an array).
  const result = await Promise.race([taskResult, registryDone]);
  await refreshW9yRegistry();
  return { ...result, ok: Boolean(result.ok) };
}

export function applyW9yMod(name, version) {
  const spec = `w9y mod apply ${name}${version ? `@${version}` : ""}`;
  runW9yModAndWait(spec, name).then((result) => {
    pushEvent("w9y.changed", {
      op: "apply",
      id: name,
      version: version || "latest",
      ok: result.ok,
      error: result.error || null,
    });
  }).catch((error) => {
    console.error(`w9y apply ${name} failed`, error);
    pushEvent("w9y.changed", { op: "apply", id: name, error: error.message });
  });
}

export function removeW9yMod(name) {
  runW9yModAndWait(`w9y mod remove ${name}`, name).then((result) => {
    pushEvent("w9y.changed", {
      op: "remove",
      id: name,
      ok: result.ok,
      error: result.error || null,
    });
  }).catch((error) => {
    console.error(`w9y remove ${name} failed`, error);
    pushEvent("w9y.changed", { op: "remove", id: name, error: error.message });
  });
}
