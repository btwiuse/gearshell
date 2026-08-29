// Crush detection and installation flows built on runHeadlessTask — the
// "execute a command, capture its output" primitive. The kernel routes
// task stdout to the worker console, so runHeadlessTask redirects into
// the per-task log, waits for the exit code via the status event, and
// reads the log back. No bash scripts, no marker files, no stat probing:
// `command -v crush` inside the real kernel environment is the single
// source of truth, and its exit code doubles as the installed flag.

import { __getWanixSystem, crushRunnerDep } from "./crush-deps.js?v=20260828.4";
import { runHeadlessTask } from "../../workspace-api.js?v=20260828.140";

export async function detectCrushInstallation() {
  if (!__getWanixSystem()) return null;
  try {
    await crushRunnerDep("waitForWanixSystem")();
  } catch {
    return null;
  }
  // `command -v crush` exits 0 with the resolved path when installed,
  // exits 1 with empty output when missing — runHeadlessTask's ok flag
  // IS the installed flag, no output parsing needed.
  const result = await runHeadlessTask({
    name: "Detect Crush",
    cmd: "command -v crush",
    term: false,
  });
  const path = (result.output || "").trim();
  if (result.ok && path) {
    return { installed: true, path, via: "command -v crush" };
  }
  // w9y installs the binary into ${WANIX}/crush (OPFS), but the namespace
  // bind only lands on the next boot — so `command -v crush` cannot see
  // it in the current session. The file's presence is still the truth:
  // surface the canonical path so the program field points at the real
  // binary.
  const cached = `${crushRunnerDep("WANIX")}/crush`;
  try {
    const root = crushRunnerDep("getWanixRoot")();
    if (root && (await root.stat(cached))) {
      return { installed: true, path: cached, via: "cached install" };
    }
  } catch {
    // file absent — not installed
  }
  return { installed: false, via: "command -v crush" };
}

// Install Crush. The exit code of `w9y mod apply crush` is the
// authoritative success signal; on failure the captured output carries
// the real error so the UI can surface it.
export async function installCrushViaW9y() {
  await crushRunnerDep("waitForWanixSystem")();
  const result = await runHeadlessTask({
    name: "Install Crush",
    cmd: "w9y mod apply crush",
    term: false,
  }, { timeoutMs: 180000 });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: result.error === "headless task timed out"
      ? "Crush install did not finish within 180 seconds."
      : (result.output?.trim() || "w9y mod apply crush failed."),
  };
}
