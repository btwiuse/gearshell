// Crush detection and installation flows built on runHeadlessTask — the
// "execute a command, capture its output" primitive. The kernel routes
// task stdout to the worker console, so runHeadlessTask redirects into
// the per-task log, waits for the exit code via the status event, and
// reads the log back. No bash scripts, no marker files, no stat probing:
// `type -a crush` inside the real kernel environment is the single source
// of truth.

import { __getWanixSystem, crushRunnerDep } from "./crush-deps.js?v=20260828.3";
import { runHeadlessTask } from "./workspace-api.js?v=20260828.21";

// Extract the resolved binary path from `type -a crush` output. Lines
// look like "crush is /wanix/crush" (external command) or describe
// aliases/functions; the LAST "is <path>" line wins so a shadowing
// alias earlier on PATH doesn't win over the real binary.
function crushPathFromTypeOutput(text) {
  let path = null;
  for (const line of text.split("\n")) {
    const match = /^crush is (.+)$/.exec(line.trim());
    if (!match) continue;
    const candidate = match[1].trim();
    if (candidate && !candidate.includes(" ")) path = candidate;
  }
  return path;
}

export async function detectCrushInstallation() {
  if (!__getWanixSystem()) return null;
  try {
    await crushRunnerDep("waitForWanixSystem")();
  } catch {
    return null;
  }
  // A probe is a probe: `type -a crush` exiting 1 (not found) is a valid
  // result, not an error, so runHeadlessTask's ok flag is ignored here —
  // the presence of a "crush is <path>" line decides.
  const result = await runHeadlessTask({
    name: "Detect Crush",
    cmd: "type -a crush",
    term: false,
  });
  const path = crushPathFromTypeOutput(result.output || "");
  if (path) return { installed: true, path, via: "type -a crush" };
  // w9y installs the binary into ${WANIX}/crush (OPFS), but the namespace
  // bind only lands on the next boot — so `type -a crush` cannot see it in
  // the current session. The file's presence is still the truth: surface
  // the canonical path so the program field points at the real binary.
  const cached = `${crushRunnerDep("WANIX")}/crush`;
  try {
    const root = crushRunnerDep("getWanixRoot")();
    if (root && (await root.stat(cached))) {
      return { installed: true, path: cached, via: "cached install" };
    }
  } catch {
    // file absent — not installed
  }
  return { installed: false, via: "type -a crush" };
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
