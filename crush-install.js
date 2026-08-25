// Crush detection and installation flows, driven by small hush scripts
// run through spawnWanixCommand. Both flows observe completion via
// filesystem side effects (a marker file / marker directory) rather than
// task events, because short-lived shell tasks emit no completion signal.

import { __getWanixSystem, crushRunnerDep } from "./crush-deps.js?v=20260826.1";
import {
  readWanixText,
  spawnWanixCommand,
} from "./crush-config.js?v=20260826.1";

// `which crush` probe driven by a small hush script so the lookup behaves
// the same way it would in a real terminal: a function we call, output
// redirected to a marker file we poll from the JS side. Using a real hush
// script (rather than a `which` argv token) means the command stays valid
// even when PATH or the shell environment changes, and we can swap in more
// diagnostics later without restructuring the call site. The script
// intentionally avoids embedded double quotes because the surrounding
// `hush -c "..."` wrapper would otherwise strip them; `which` only writes
// the resolved path or nothing, so the function body stays quote-free.
// The redirection and the stderr suppression live inside the script body
// so hush parses them as shell syntax; passing `>` and `2>/dev/null` as
// separate argv tokens would leave them as literal positional args ($1,
// $2) and the output would just stream to the kernel. The marker path is
// appended after the script via shell-side parameter expansion so the same
// template works for every call.
const CRUSH_DETECT_SCRIPT = `function detect_crush() {
  which crush 2>/dev/null
}
detect_crush > "$CRUSH_DETECT_OUT"
`;

export async function detectCrushInstallation() {
  if (!__getWanixSystem()) return null;
  try {
    await crushRunnerDep("waitForWanixSystem")();
  } catch {
    return null;
  }
  // /tmp maps to a fresh in-memory ramfs namespace (DEFAULT_SYSTEM_CONFIG.tmp
  // -> #ramfs/new), which is writable from inside tasks. OPFS is read-only
  // for the JS-side wanix worker, so the answer file must live in /tmp.
  // Each call uses a unique marker path so concurrent detection effects
  // (e.g. the mount effect firing alongside the workspace-change effect)
  // cannot delete each other's answer file mid-poll.
  const markerPath = `/tmp/.crush-detect.${Date.now().toString(36)}-${
    Math.random().toString(36).slice(2, 8)
  }.txt`;
  try {
    await crushRunnerDep("getWanixRoot")().remove(markerPath);
  } catch { /* nothing to remove */ }
  let spawn;
  try {
    spawn = spawnWanixCommand(`hush -c "${CRUSH_DETECT_SCRIPT}"`, {
      env: crushRunnerDep("buildEnv")(`CRUSH_DETECT_OUT=${markerPath}`),
    });
  } catch (error) {
    return null;
  }
  // Poll for the answer file. `which` exits in well under a second, so the
  // 15s deadline covers even a cold kernel. `which` writes a single path on
  // success and writes nothing on miss; we infer the install state from the
  // resulting file content rather than relying on a task completion event.
  const deadline = Date.now() + 15000;
  let whichResult = null;
  try {
    while (Date.now() < deadline) {
      const text = await readWanixText(markerPath);
      if (text != null) {
        const path = text.trim();
        if (path.length > 0) {
          whichResult = { installed: true, path, via: "which crush" };
        } else whichResult = { installed: false, via: "which crush" };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!whichResult) {
      whichResult = { installed: false, via: "which crush (timeout)" };
    }
  } finally {
    spawn?.dispose();
    try {
      await crushRunnerDep("getWanixRoot")().remove(markerPath);
    } catch { /* ignore */ }
  }
  // If `which crush` did not find the binary, check for the boot-time
  // install marker. The boot profile's w9y_detect skips re-installing once
  // the marker exists, which means a reload can leave the crush binding
  // missing from the namespace even though the install itself succeeded
  // previously. In that case surface the canonical install path so the
  // program field still points at the real binary.
  if (!whichResult.installed) {
    try {
      await crushRunnerDep("getWanixRoot")().readDir(
        `${crushRunnerDep("HOME")}/.w9y/crush`,
      );
      return {
        installed: true,
        path: `${crushRunnerDep("WANIX")}/crush`,
        via: "reusing cached install",
      };
    } catch { /* marker absent either */ }
  }
  return whichResult;
}

// Crush install driven by a real hush function. The script intentionally
// avoids embedded double quotes: wrapping it in `hush -c "..."` would have
// the outer shell parser strip those quotes, breaking the function body.
// The function returns 0 on success and 1 on failure; the JS side surfaces
// the outcome to the UI and the marker directory at $HOME/.w9y/crush is the
// canonical install marker (matching what the boot profile creates).
// The stdout+stderr capture is part of the script body so hush parses the
// redirection. The log path comes from $CRUSH_INSTALL_LOG so the same
// template works for every call.
const CRUSH_INSTALL_SCRIPT = `function install_crush() {
  if [[ -d $HOME/.w9y/crush ]]; then
    return 0
  fi
  if /w9y mod apply crush; then
    mkdir -p $HOME/.w9y/crush
    return 0
  fi
  return 1
}
install_crush > "$CRUSH_INSTALL_LOG" 2>&1
`;

export async function installCrushViaW9y() {
  await crushRunnerDep("waitForWanixSystem")();
  const markerPath = `${crushRunnerDep("HOME")}/.w9y/crush`;
  // w9y may print noisy progress; capture stdout+stderr to a tmp file so the
  // UI can surface the real failure message if the install ever errors out.
  const logPath = "/tmp/.crush-install.log";
  try {
    await crushRunnerDep("getWanixRoot")().remove(logPath);
  } catch { /* nothing to remove */ }
  const spawn = spawnWanixCommand(`hush -c "${CRUSH_INSTALL_SCRIPT}"`, {
    env: crushRunnerDep("buildEnv")(`CRUSH_INSTALL_LOG=${logPath}`),
  });
  // Poll for the marker directory. Once it appears we know both that w9y
  // succeeded and that subsequent boots will skip the install.
  const deadline = Date.now() + 90000;
  try {
    while (Date.now() < deadline) {
      try {
        await crushRunnerDep("getWanixRoot")().readDir(markerPath);
        return { installed: true };
      } catch {
        // Marker not present yet; w9y is still working or has failed.
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const log = await readWanixText(logPath);
    return {
      installed: false,
      error: log
        ? `Crush install did not finish within 90 seconds.
${log.trim()}`
        : "Crush install did not finish within 90 seconds.",
    };
  } finally {
    spawn?.dispose();
    try {
      await crushRunnerDep("getWanixRoot")().remove(logPath);
    } catch { /* ignore */ }
  }
}
