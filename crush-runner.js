// Crush Runner: a manual configuration page for the Crush CLI agent.
//
// This module owns the `crush-runner` dockview panel end-to-end: the
// per-instance crushrc file under /tmp, the `which crush` / `w9y mod
// apply crush` detection + install flows, the inline terminal preview,
// and the form that lets the user customise every launch field. Keeping
// it out of app.js keeps the main bundle focused on the rest of the
// shell and lets the diff for this feature stay isolated.
//
// Dependency-injection shim: app.js calls `initCrushRunner(dependencies)`
// from the bottom of its module body, populating a small lookup table
// that the helpers below read lazily via `crushRunnerDep(name)`. This
// keeps the modules loosely coupled without requiring a wider refactor
// to deal with an ESM circular import.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  Download,
  FileCode,
  KeyRound,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  SlidersHorizontal,
  User,
  X,
  Zap,
} from "lucide-react";

let __crushRunnerDeps = null;
export function initCrushRunner(dependencies) {
  __crushRunnerDeps = dependencies;
}

// Push the module-level counter past `maxId` so subsequent
// addCrushRunnerPanel calls mint fresh ids above any previously
// allocated ones. Used by restoreSavedPanels so newly opened panels
// after a reload never collide with restored ids, even when the saved
// snapshot predates the panelId field (legacy snapshots stored no
// panel id at all and would otherwise leave the counter at 0).
export function reserveCrushRunnerIds(maxId) {
  if (Number.isFinite(Number(maxId)) && Number(maxId) > crushRunnerIdCounter) {
    crushRunnerIdCounter = Number(maxId);
  }
}
function crushRunnerDep(name) {
  if (__crushRunnerDeps == null) {
    throw new Error(
      "crush-runner: initCrushRunner() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __crushRunnerDeps[name];
  if (value === undefined) {
    throw new Error(`crush-runner: missing dependency ${name}`);
  }
  return value;
}

function __getWanixSystem() {
  return document.getElementById("wanix-system");
}

const CRUSH_RUNNER_DEFAULT_PROFILE = {
  id: "crush",
  name: "Crush",
  program: "crush",
  args: "",
  type: "gojs",
  env: "USER=me",
  // Default working directory. The HOME bind (`/opfs/home`) is injected via
  // initCrushRunner, so resolve it lazily: spreading the profile at module
  // load would throw because deps are wired later. getCrushRunnerDefaults
  // snapshots the current HOME into a concrete string whenever the form or
  // a preset switch needs a starting point.
  get wd() {
    return crushRunnerDep("HOME");
  },
  icon: "bot",
};
// Default Crush config written to `${CRUSH_GLOBAL_CONFIG}/crushrc` on
// launch. Each panel instance gets its own directory so concurrent Crush
// sessions do not stomp on each other's provider/model defaults. Users
// can edit this freely in the UI; the Reset button restores the seeded
// values below. Line continuations (`\`) carry through to the file
// verbatim, so every `provider add` keeps its multi-line shape.
const DEFAULT_CRUSHRC = [
  "AGW=https://agw.up.railway.app",
  "",
  // Use double quotes for the multi-line `provider add` entries so the
  // trailing line-continuation backslash does not escape the closing
  // quote. `${AGW}` stays a literal here because plain double-quoted
  // JS strings do not interpolate; crush will expand it at config-load.
  "provider add deepseek \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  "",
  "provider add stepfun \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  "",
  "provider add minimax-china \\",
  "  --type anthropic \\",
  '  --base-url "${AGW}/anthropic" \\',
  '  --api-key "-"',
  "",
  "model small deepseek/deepseek-v4-flash",
  "model large deepseek/deepseek-v4-flash",
  "model small stepfun/step-3.7-flash",
  "model large stepfun/step-3.7-flash",
  "model small minimax-china/MiniMax-M3",
  "model large minimax-china/MiniMax-M3",
  "",
  "option ui transparent false",
  "",
].join("\n");
function getCrushRunnerDefaults(preset = null) {
  // Built-in defaults win; if a preset is supplied (active or seeded),
  // surface it as the starting point so this panel reflects whichever
  // Crush configuration the user has chosen to edit.
  if (!preset) return { ...CRUSH_RUNNER_DEFAULT_PROFILE };
  const { id: _id, builtin: _builtin, crushrc: _crushrc, ...rest } = preset;
  return { ...CRUSH_RUNNER_DEFAULT_PROFILE, ...rest };
}
function getCrushRunnerCrushrcFor(preset = null) {
  if (!preset) return DEFAULT_CRUSHRC;
  return preset.crushrc || DEFAULT_CRUSHRC;
}
// Pick a per-panel config directory under /tmp. Each CrushRunner instance
// owns its own directory so concurrent Crush launches don't fight over a
// shared ${CRUSH_GLOBAL_CONFIG}/crushrc. The path is derived from the
// runnerId the panel was registered with, which is stable across renders
// within the same panel.
function crushConfigDirFor(runnerId) {
  // Accept any non-empty string/number id. Dash-separated ids like
  // "2-3" (panel #2, launch #3) used to fall through to the "shared"
  // bucket because Number("2-3") is NaN; that defeated the per-launch
  // isolation guarantee, so we now stringify whatever the caller hands
  // us. Empty/missing falls back to "shared" for sanity.
  if (runnerId === null || runnerId === undefined || runnerId === "") {
    return "/tmp/crush-runner-shared";
  }
  const safeId = String(runnerId).replace(/[^A-Za-z0-9._-]/g, "_");
  return `/tmp/crush-runner-${safeId}`;
}
// Build the profile that the Crush process should be launched with for
// `runnerId`, including writing ${configDir}/crushrc so the binary picks
// up the user's per-panel defaults. Shared between the inline terminal
// preview and the dedicated Launch Crush button so the two views always
// see the same configuration.
async function prepareCrushLaunch(runnerId, draft, crushrcContent) {
  const configDir = crushConfigDirFor(runnerId);
  await writeCrushrc(configDir, crushrcContent);
  const userEnv = (draft.env || "").trim();
  const lines = userEnv ? userEnv.split("\n").filter(Boolean) : [];
  const withoutConfig = lines.filter((line) =>
    !/^CRUSH_GLOBAL_CONFIG\s*=/.test(line)
  );
  const mergedEnv = [...withoutConfig, `CRUSH_GLOBAL_CONFIG=${configDir}`].join(
    "\n",
  );
  return {
    configDir,
    profile: {
      name: (draft.name || "").trim() || "Crush",
      program: (draft.program || "crush").trim(),
      args: (draft.args || "").trim(),
      type: draft.type || "gojs",
      env: mergedEnv,
      wd: (draft.wd || "").trim(),
      icon: draft.icon || "bot",
    },
  };
}

// Write `content` to `${configDir}/crushrc` via the Wanix kernel root.
// Creates the directory if it does not exist; the directory lives under
// /tmp (writable in-memory ramfs) so this never touches the user's OPFS.
async function writeCrushrc(configDir, content) {
  await crushRunnerDep("waitForWanixSystem")();
  const root = crushRunnerDep("getWanixRoot")();
  try {
    await root.makeDir(configDir);
  } catch (error) {
    // EEXIST is fine; anything else should bubble up. The wanix kernel
    // throws a String (not an Error) so we stringify the whole value
    // rather than reaching for `.message` which would always be empty.
    if (!/exist|exists/i.test(String(error))) throw error;
  }
  // Pass the content as a Uint8Array so multi-byte UTF-8 sequences survive
  // the kernel's writeFile round-trip; hush task env injection also works
  // but going through the kernel API keeps the data on the JS side and
  // avoids spawning a throwaway task for every launch.
  const bytes = new TextEncoder().encode(content);
  await root.writeFile(`${configDir}/crushrc`, bytes);
}

// Spawn a headless wanix-task that runs `cmd` and tear it down when the
// returned `dispose` is called. The task itself does not emit a completion
// event for short-lived shell commands, so callers observe completion via
// filesystem side effects (file presence, marker directory, etc.) and then
// invoke `dispose()` to remove the task from the wanix-system. `onError`
// is called once if the task fails to start. The optional `env` argument is
// the crushRunnerDep("WANIX") shell environment string (KEY=value lines) the task should see;
// we default to the full Hush environment so w9y and friends can find crushRunnerDep("WANIX"),
// PATH, crushRunnerDep("HOME"), etc.
function spawnWanixCommand(
  cmd,
  { env = crushRunnerDep("buildEnv")(""), onError } = {},
) {
  if (!__getWanixSystem()) throw new Error("Wanix system is not available.");
  const task = document.createElement("wanix-task");
  task.setAttribute("cmd", cmd);
  task.setAttribute("type", "gojs");
  task.setAttribute("start", "");
  task.setAttribute("for", "wanix-system");
  task.setAttribute("wd", "/");
  if (env) task.setAttribute("env", env);
  task.addEventListener("error", (event) => {
    onError?.(
      event.detail?.error || event.detail || new Error("Task failed to start."),
    );
  });
  __getWanixSystem().appendChild(task);
  return {
    task,
    dispose: () => {
      if (task.parentNode) task.parentNode.removeChild(task);
    },
  };
}

// Read a filesystem entry as text, returning null when the entry is missing
// or unreadable. Centralizes the decode logic so detection does not have to
// special-case string vs Uint8Array payloads.
async function readWanixText(path) {
  try {
    const data = await crushRunnerDep("getWanixRoot")().readFile(path);
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(data));
    }
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    return String(data ?? "");
  } catch {
    return null;
  }
}

// `which crush` probe driven by a small hush script so the lookup behaves
// the same way it would in a real terminal: a function we call, output
// redirected to a marker file we poll from the JS side. Using a real hush
// script (rather than a `which` argv token) means the command stays valid
// even when PATH or the shell environment changes, and we can swap in more
// diagnostics later without restructuring the call site. The script
// intentionally avoids embedded double quotes because the surrounding
// `hush -c "..."` wrapper would otherwise strip them; `which` only writes
// the resolved path or nothing, so the function body stays quote-free.
// `which crush` probe driven by a real hush function. The redirection and
// the stderr suppression live inside the script body so hush parses them as
// shell syntax; passing `>` and `2>/dev/null` as separate argv tokens would
// leave them as literal positional args ($1, $2) and the output would just
// stream to the kernel. The marker path is appended after the script via
// shell-side parameter expansion so the same template works for every call.
const CRUSH_DETECT_SCRIPT = `function detect_crush() {
  which crush 2>/dev/null
}
detect_crush > "$CRUSH_DETECT_OUT"
`;
async function detectCrushInstallation() {
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

// Crush install driven by a self-contained hush script. We define a real
// `install_crush` function (mirroring the `w9y_detect` style in the boot
// profile) so future scripts can source it, then invoke the function with
// the same `&& mkdir -p $HOME/.w9y/crush` trailing step that the boot
// profile uses to mark the install as already attempted. The function-based
// later without restructuring the JS call site.
// The inner double quotes are escaped so the surrounding hush -c "..." can
// keep the entire script intact as a single argv entry. Without the escapes,
// hush's own tokenizer splits the body on `"` boundaries and the function
// definitions become broken (e.g. `echo "crush already installed"` becomes
// four separate tokens `echo`, `crush`, `already`, `installed`).
// Crush install driven by a real hush function. The script intentionally
// avoids embedded double quotes: wrapping it in `hush -c "..."` would have
// the outer shell parser strip those quotes, breaking the function body.
// The function returns 0 on success and 1 on failure; the JS side surfaces
// the outcome to the UI and the marker directory at $HOME/.w9y/crush is the
// canonical install marker (matching what the boot profile creates).
// Crush install driven by a real hush function. The stdout+stderr capture
// is part of the script body so hush parses the redirection. The log path
// comes from $CRUSH_INSTALL_LOG so the same template works for every call.
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

async function installCrushViaW9y() {
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
function CrushRunnerPanel({ api, params, containerApi }) {
  const dockApi = containerApi || dockviewApi;
  // Preset model: every Crush configuration the user has saved lives in
  // `config.crushRunnerPresets`. Built-in Crush is always at index 0 and
  // can't be deleted; user presets come after, ordered by
  // `config.crushRunnerPresetOrder`. We re-read the list whenever the
  // workspace changes so other panels editing the config see the new
  // ordering without a page reload.
  const [presets, setPresets] = useState(() =>
    crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")())
  );
  const activePreset = presets.find((preset) =>
    preset.id ===
      (crushRunnerDep("loadConfig")().crushRunnerActiveId || "crush")
  ) ||
    presets[0];
  const [draft, setDraft] = useState(() =>
    getCrushRunnerDefaults(activePreset)
  );
  const [status, setStatus] = useState({ message: "", isError: false });
  const [savedMarker, setSavedMarker] = useState(0);
  // null = detection in flight, true = crush on PATH, false = missing.
  const [crushInstalled, setCrushInstalled] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [detectSource, setDetectSource] = useState("");
  // Per-session toggle that hides the entire install banner once the
  // user dismisses it. Resets to false on every page load so a
  // refresh brings the banner back.
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  // Tracks whether the user has manually edited the program field. Detection
  // and install both want to keep the program in sync with the real binary
  // path, but only as long as the user has not taken ownership of the field.
  const programAutoManagedRef = useRef(true);
  const applyDetectedProgram = (next) => {
    if (!programAutoManagedRef.current) return;
    if (!next) return;
    setDraft((
      current,
    ) => (current.program === next ? current : { ...current, program: next }));
  };
  // Per-panel crushrc content. Seeded from the active preset (which falls
  // back to the built-in default); the user edits it in-place and we write
  // it out to ${CRUSH_GLOBAL_CONFIG}/crushrc on launch. Each panel gets its
  // own state so edits in one panel do not leak into another.
  const [crushrcContent, setCrushrcContent] = useState(() =>
    getCrushRunnerCrushrcFor(activePreset)
  );
  const crushrcDirty =
    crushrcContent !== getCrushRunnerCrushrcFor(activePreset);
  // Active tab inside the configuration section. Three tabs (Profile /
  // Config / Env) collapse what used to be three always-open <details>
  // blocks into a single tabbed panel so the page stops scrolling past
  // the form on shorter windows.
  const [activeTab, setActiveTab] = useState("profile");
  // The configuration section starts collapsed so the default view
  // reads as "ready to launch". The toggle button alone controls
  // formExpanded; switching presets and saving updates leave it
  // alone so the user's edit context survives across presets.
  const [formExpanded, setFormExpanded] = useState(false);
  const switchToPreset = (preset) => {
    setDraft(getCrushRunnerDefaults(preset));
    setCrushrcContent(getCrushRunnerCrushrcFor(preset));
    setSavedMarker((value) => value + 1);
    programAutoManagedRef.current = true;
  };
  useEffect(() => {
    let cancelled = false;
    let activeTask = 0;
    const detect = async () => {
      const id = ++activeTask;
      const result = await detectCrushInstallation();
      if (cancelled || id !== activeTask) return;
      if (result == null) {
        setCrushInstalled(null);
        setDetectSource("waiting for wanix");
      } else {
        setCrushInstalled(result.installed);
        setDetectSource(
          result.path
            ? `${result.via} → ${result.path}`
            : (result.via || "which crush"),
        );
        if (result.installed && result.path) applyDetectedProgram(result.path);
      }
    };
    detect();
    const onReady = () => detect();
    const onError = () => detect();
    // Workspace changes also need to reset the form to the active preset
    // and give us a fresh chance to keep the program field in sync with
    // detection until the user takes ownership of it.
    const onWorkspaceChange = () => {
      const fresh = crushRunnerDep("getCrushRunnerPresets")(
        crushRunnerDep("loadConfig")(),
      );
      setPresets(fresh);
      const nextActive = fresh.find((preset) =>
        preset.id ===
          (crushRunnerDep("loadConfig")().crushRunnerActiveId || "crush")
      ) || fresh[0];
      switchToPreset(nextActive);
      detect();
    };
    // Re-run detection whenever the Wanix kernel finishes starting up; the
    // first detect() call often races the boot and would otherwise leave
    // the user staring at "Checking for crush…" forever.
    __getWanixSystem()?.addEventListener("ready", onReady);
    __getWanixSystem()?.addEventListener("error", onError);
    window.addEventListener(
      crushRunnerDep("WORKSPACE_CHANGED_EVENT"),
      onWorkspaceChange,
    );
    return () => {
      cancelled = true;
      __getWanixSystem()?.removeEventListener("ready", onReady);
      __getWanixSystem()?.removeEventListener("error", onError);
      window.removeEventListener(
        crushRunnerDep("WORKSPACE_CHANGED_EVENT"),
        onWorkspaceChange,
      );
    };
  }, []);

  const updateField = (field, value) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    setStatus({
      message: "Installing Crush via `w9y mod apply crush`…",
      isError: false,
    });
    try {
      const result = await installCrushViaW9y();
      if (!result.installed) {
        setCrushInstalled(false);
        setStatus({
          message: result.error || "Crush install did not complete.",
          isError: true,
        });
        return;
      }
      // The marker directory the boot script creates proves w9y finished
      // cleanly, so we treat that as the source of truth and immediately
      // mark Crush as installed. A follow-up `which crush` probe races the
      // namespace binding (the binary appears in PATH slightly after the
      // marker is created) and frequently times out, so we only re-run it
      // when the user explicitly hits the re-check button.
      // w9y always installs the crush binary at ${crushRunnerDep("WANIX")}/crush, so mirror
      // that exact path here. Detection runs may have timed out because the
      // namespace binding races the marker creation, so we cannot rely on
      // `which crush` to discover the path at this point.
      const installedPath = `${crushRunnerDep("WANIX")}/crush`;
      applyDetectedProgram(installedPath);
      setCrushInstalled(true);
      setDetectSource(`reusing cached install at ${installedPath}`);
      setStatus({
        message: "Crush installed. You can launch it now.",
        isError: false,
      });
    } catch (error) {
      setCrushInstalled(false);
      setStatus({
        message: error.message || "Failed to install Crush.",
        isError: true,
      });
    } finally {
      setInstalling(false);
    }
  };

  const isDirty = (() => {
    const base = activePreset || CRUSH_RUNNER_DEFAULT_PROFILE;
    if (crushrcContent !== (base.crushrc || DEFAULT_CRUSHRC)) return true;
    return ["name", "icon", "program", "args", "type", "env", "wd"].some(
      (field) =>
        (draft[field] || "") !==
          ((base[field] == null
            ? CRUSH_RUNNER_DEFAULT_PROFILE[field]
            : base[field]) || ""),
    );
  })();

  const commandPreview = [draft.program, draft.args].filter(Boolean).join(" ")
    .trim();
  const envLines = (draft.env || "").split("\n").map((line) => line.trim())
    .filter(Boolean);

  // Per-tab dirty state so the asterisk on each tab reflects the inputs
  // that tab actually edits. Profile owns name/icon/program/args/type/wd,
  // Config owns crushrc, Env owns env. Sharing `isDirty` here would
  // mark every tab dirty whenever any one of them drifted.
  const profileDirty = isDirty && (() => {
    const base = activePreset || CRUSH_RUNNER_DEFAULT_PROFILE;
    return ["name", "icon", "program", "args", "type", "wd"].some(
      (field) =>
        (draft[field] || "") !==
          ((base[field] == null
            ? CRUSH_RUNNER_DEFAULT_PROFILE[field]
            : base[field]) || ""),
    );
  })();
  const envDirty = (() => {
    const base = activePreset || CRUSH_RUNNER_DEFAULT_PROFILE;
    return (draft.env || "") !==
      ((base.env == null ? CRUSH_RUNNER_DEFAULT_PROFILE.env : base.env) || "");
  })();
  const configDirty = crushrcDirty;

  // Open a fresh Crush terminal in a new dockview tab. Used by both the
  // hero Launch button and the preview section's "Open in new panel"
  // action so the two flows stay in lock-step. Records the launched
  // profile/crushrc so the "Profile changed" banner can prompt for a
  // restart when the user edits the form afterwards.
  const openCrushInNewPanel = async ({ source } = {}) => {
    if (!dockApi) return;
    // Mint a fresh launch id so each Crush process owns its own
    // /tmp/crush-runner-<launchId>/crushrc directory. Reusing the panel's
    // runnerId would mean a second Launch overwrites the first Crush
    // instance's crushrc while it is still running. The launch id keeps
    // a strong relationship with the panel id by mixing it into the
    // counter seed, so CrushRunner panel #2's launches land in
    // /tmp/crush-runner-2-1, 2-2, 2-3, etc., which makes it obvious
    // which panel spawned each running Crush instance.
    const panelId = Number(params?.runnerId);
    const baseId = Number.isFinite(panelId) && panelId > 0 ? panelId : 1;
    const nextIndex = (perPanelLaunchCount[baseId] || 0) + 1;
    perPanelLaunchCount[baseId] = nextIndex;
    const launchId = `${baseId}-${nextIndex}`;
    setStatus({
      message: `Writing ${crushConfigDirFor(launchId)}/crushrc…`,
      isError: false,
    });
    try {
      const { configDir, profile } = await prepareCrushLaunch(
        launchId,
        draft,
        crushrcContent,
      );
      crushRunnerDep("addTerminalPanel")(dockApi, undefined, profile);
      setStatus({
        message: `Launched ${profile.program}${
          profile.args ? " " + profile.args : ""
        } with CRUSH_GLOBAL_CONFIG=${configDir}${
          source ? ` (${source})` : ""
        }.`,
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Failed to launch Crush.",
        isError: true,
      });
    }
  };
  const launchCrush = (event) => {
    if (event) event.preventDefault();
    openCrushInNewPanel({ source: "launch" });
  };

  const saveUpdates = () => {
    try {
      const config = crushRunnerDep("loadConfig")();
      const others = (config.crushRunnerPresets || []).filter((preset) =>
        preset.id !== activePreset.id
      );
      const nextPreset = crushRunnerDep("normalizeCrushRunnerPreset")({
        ...CRUSH_RUNNER_DEFAULT_PROFILE,
        ...activePreset,
        ...draft,
        id: activePreset.id,
        builtin: activePreset.builtin === true,
        crushrc: crushrcContent,
      });
      const nextPresets = activePreset.builtin
        ? [{ ...nextPreset, builtin: false, id: nextPreset.id }, ...others]
        : [nextPreset, ...others];
      crushRunnerDep("saveCrushRunnerPresets")(
        nextPresets,
        activePreset.id,
        config.crushRunnerPresetOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      setSavedMarker((value) => value + 1);
      setStatus({
        message: `Saved updates to "${activePreset.name}".`,
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to save the preset.",
        isError: true,
      });
    }
  };

  const saveAsNewPreset = () => {
    try {
      const config = crushRunnerDep("loadConfig")();
      const baseName = (draft.name || "").trim() || activePreset.name ||
        "Crush";
      let candidate = baseName;
      let suffix = 2;
      while (
        (config.crushRunnerPresets || []).some((preset) =>
          preset.name.toLocaleLowerCase() === candidate.toLocaleLowerCase()
        )
      ) {
        candidate = `${baseName} (${suffix++})`;
      }
      const nextPreset = crushRunnerDep("normalizeCrushRunnerPreset")({
        ...CRUSH_RUNNER_DEFAULT_PROFILE,
        ...activePreset,
        ...draft,
        // Force a fresh id and mark this as a user preset so it doesn't
        // collide with the built-in `crush` slot; spreading activePreset
        // would otherwise re-use its id (`crush` for the built-in tab) and
        // silently overwrite the built-in instead of creating a sibling.
        id: undefined,
        name: candidate,
        builtin: false,
        crushrc: crushrcContent,
      });
      const nextPresets = [...(config.crushRunnerPresets || []), nextPreset];
      const activeIndex = (config.crushRunnerPresetOrder || []).indexOf(
        activePreset.id,
      );
      // Insert the new preset immediately after the source preset so it
      // appears as a sibling in the UI ("presets derived from X live next
      // to X"), rather than jumping to the top of the list.
      const nextOrder = activeIndex === -1
        ? [nextPreset.id, ...(config.crushRunnerPresetOrder || [])]
        : [
          ...(config.crushRunnerPresetOrder || []).slice(0, activeIndex + 1),
          nextPreset.id,
          ...(config.crushRunnerPresetOrder || []).slice(activeIndex + 1)
            .filter((id) => id !== nextPreset.id),
        ];
      crushRunnerDep("saveCrushRunnerPresets")(
        nextPresets,
        nextPreset.id,
        nextOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      switchToPreset(nextPreset);
      setStatus({
        message: `Saved "${candidate}" as a new preset.`,
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to save the new preset.",
        isError: true,
      });
    }
  };

  const deleteActivePreset = () => {
    if (activePreset.builtin) {
      setStatus({
        message: "Built-in Crush preset cannot be deleted.",
        isError: true,
      });
      return;
    }
    try {
      const config = crushRunnerDep("loadConfig")();
      const remaining = (config.crushRunnerPresets || []).filter((preset) =>
        preset.id !== activePreset.id
      );
      const nextOrder = (config.crushRunnerPresetOrder || []).filter((id) =>
        id !== activePreset.id
      );
      crushRunnerDep("saveCrushRunnerPresets")(remaining, "crush", nextOrder);
      const fresh = crushRunnerDep("getCrushRunnerPresets")(
        crushRunnerDep("loadConfig")(),
      );
      setPresets(fresh);
      const nextActive = fresh[0];
      switchToPreset(nextActive);
      setStatus({ message: `Removed "${activePreset.name}".`, isError: false });
    } catch (error) {
      setStatus({
        message: error.message || "Unable to delete the preset.",
        isError: true,
      });
    }
  };

  const activatePreset = (preset) => {
    if (preset.id === activePreset.id) return;
    try {
      const config = crushRunnerDep("loadConfig")();
      crushRunnerDep("saveCrushRunnerPresets")(
        config.crushRunnerPresets || [],
        preset.id,
        config.crushRunnerPresetOrder,
      );
      setPresets(
        crushRunnerDep("getCrushRunnerPresets")(crushRunnerDep("loadConfig")()),
      );
      switchToPreset(preset);
      // Skip the status banner: the chip / dropdown highlight already
      // tells the user which preset is active, and a "Active preset: X"
      // toast is just noise.
    } catch (error) {
      setStatus({
        message: error.message || "Unable to switch presets.",
        isError: true,
      });
    }
  };

  // Per-tab reset helpers. Each operates only on the inputs the tab
  // owns so a reset never reaches across the tab boundary. The button
  // is disabled when the corresponding tab is already clean.
  const resetProfileFields = () => {
    // Built-in presets reset to the code-side CRUSH_RUNNER_DEFAULT_PROFILE so
    // localStorage overrides from older sessions can't leak into the form.
    // User presets still reset to their own saved values, since the user
    // explicitly authored those.
    const base = activePreset && activePreset.builtin === false
      ? activePreset
      : CRUSH_RUNNER_DEFAULT_PROFILE;
    const pick = (field) =>
      base[field] == null ? CRUSH_RUNNER_DEFAULT_PROFILE[field] : base[field];
    setDraft((current) => ({
      ...current,
      name: pick("name") || "",
      icon: pick("icon") || "bot",
      program: pick("program") || "crush",
      args: pick("args") || "",
      type: pick("type") || "gojs",
      wd: pick("wd") || "",
    }));
    programAutoManagedRef.current = true;
    setStatus({
      message: "Reset profile fields to the saved preset.",
      isError: false,
    });
  };
  const resetEnvField = () => {
    const base = activePreset && activePreset.builtin === false
      ? activePreset
      : CRUSH_RUNNER_DEFAULT_PROFILE;
    const fallback = CRUSH_RUNNER_DEFAULT_PROFILE.env || "";
    const next = base.env == null ? fallback : (base.env || "");
    updateField("env", next);
    setStatus({
      message: "Reset env overrides to the saved preset.",
      isError: false,
    });
  };
  const resetCrushrcField = () => {
    // Built-in presets reset to their own bundled crushrc template so
    // each provider-specific slot (Ox, MiniMax, DeepSeek, StepFun, All)
    // round-trips back to its shipped config. User presets also reset
    // to their own saved crushrc; the shared DEFAULT_CRUSHRC only
    // serves as the ultimate fallback when no preset is active.
    const fallback = activePreset && activePreset.crushrc
      ? activePreset.crushrc
      : DEFAULT_CRUSHRC;
    setCrushrcContent(fallback);
    setStatus({
      message: "Reset crushrc to the built-in template.",
      isError: false,
    });
  };
  const copyProfileJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(
        {
          profile: draft,
          crushrc: crushrcContent,
          configDir: crushConfigDirFor(params?.runnerId),
        },
        null,
        2,
      ));
      setStatus({
        message: "Copied profile + crushrc to clipboard.",
        isError: false,
      });
    } catch (error) {
      setStatus({
        message: error.message || "Clipboard copy failed.",
        isError: true,
      });
    }
  };

  // JSON tab: serialise the whole preset (profile fields + crushrc) into a
  // pretty-printed buffer so users can edit the snapshot in one place.
  // Edits round-trip back into the per-field state through applyJsonEdit
  // so the other tabs stay in sync with whatever the user types here.
  const SUPPORTED_TASK_TYPES = ["auto", "gojs", "wasi", "js"];
  const buildJsonSnapshot = () => ({
    id: (activePreset && activePreset.id) || "crush",
    name: draft.name || "",
    icon: draft.icon || "bot",
    program: draft.program || "",
    args: draft.args || "",
    type: draft.type || "gojs",
    env: draft.env || "",
    wd: draft.wd || "",
    crushrc: crushrcContent || "",
  });
  const jsonSnapshot = JSON.stringify(buildJsonSnapshot(), null, 2);
  const [jsonDraft, setJsonDraft] = useState(jsonSnapshot);
  // Keep the buffer in sync whenever the user edits one of the per-field
  // tabs; we only overwrite the local copy if it currently matches what
  // we last computed, so we don't trample an in-flight JSON edit.
  const jsonSnapshotPrevRef = useRef(jsonSnapshot);
  useEffect(() => {
    if (jsonSnapshot === jsonSnapshotPrevRef.current) return;
    if (jsonDraft === jsonSnapshotPrevRef.current) {
      setJsonDraft(jsonSnapshot);
    }
    jsonSnapshotPrevRef.current = jsonSnapshot;
  }, [jsonSnapshot, jsonDraft]);
  const jsonDraftDirty = jsonDraft !== jsonSnapshot;
  const parseJsonDraft = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: `Invalid JSON: ${error.message}` };
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "JSON must describe an object." };
    }
    const stringField = (key) => {
      const value = parsed[key];
      if (value == null) return "";
      if (typeof value !== "string") {
        return { ok: false, error: `Field "${key}" must be a string.` };
      }
      return value;
    };
    const name = stringField("name");
    const icon = stringField("icon");
    const program = stringField("program");
    const args = stringField("args");
    const type = stringField("type");
    const env = stringField("env");
    const wd = stringField("wd");
    const crushrc = stringField("crushrc");
    for (const result of [name, icon, program, args, type, env, wd, crushrc]) {
      if (typeof result !== "string") return result;
    }
    if (!SUPPORTED_TASK_TYPES.includes(type)) {
      return {
        ok: false,
        error: `Field "type" must be one of ${
          SUPPORTED_TASK_TYPES.join(", ")
        }.`,
      };
    }
    const iconTable = crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID");
    if (icon && !iconTable[icon]) {
      return { ok: false, error: `Unknown icon "${icon}".` };
    }
    return {
      ok: true,
      value: { name, icon, program, args, type, env, wd, crushrc },
    };
  };
  const applyJsonEdit = (raw) => {
    setJsonDraft(raw);
    const result = parseJsonDraft(raw);
    if (!result.ok) {
      setStatus({ message: result.error, isError: true });
      return;
    }
    setStatus({ message: "", isError: false });
    setDraft((current) => ({
      ...current,
      name: result.value.name,
      icon: result.value.icon || "bot",
      program: result.value.program || "crush",
      args: result.value.args,
      type: result.value.type,
      env: result.value.env,
      wd: result.value.wd,
    }));
    setCrushrcContent(result.value.crushrc);
    setStatus({ message: "Synced JSON into the form.", isError: false });
  };
  const resetJsonDraft = () => {
    setJsonDraft(JSON.stringify(buildJsonSnapshot(), null, 2));
    setStatus({
      message: "Reset JSON to the current form state.",
      isError: false,
    });
  };

  return React.createElement(
    "div",
    { className: "crush-runner-panel panel-content" },
    React.createElement(
      "div",
      { className: "crush-runner-shell" },
      // Hero mirrors the landing page so launching Crush feels like pressing
      // the Open Terminal CTA: kicker, headline, lede, primary CTA, ghost CTA.
      React.createElement(
        "header",
        { className: "crush-runner-hero" },
        React.createElement("h1", null, "Crush, in your browser."),
        React.createElement(
          "p",
          { className: "crush-runner-lede" },
          "Edit any field below, then Launch to open a Crush session in a new tab. Switch presets to compare configurations, or save the current form as a new preset.",
        ),
        // Per-session dismiss: hide the whole banner when the user
        // clicks the close glyph. The state lives in a useState hook
        // so a page reload restores the banner without any
        // persistent storage side effects.
        !installBannerDismissed &&
          React.createElement(
            "div",
            {
              className: "crush-runner-install",
              "data-state": crushInstalled === null
                ? "checking"
                : crushInstalled
                ? "installed"
                : "missing",
            },
            !installing &&
              React.createElement(
                "button",
                {
                  type: "button",
                  className:
                    "mkt-btn mkt-btn-ghost crush-runner-install-recheck",
                  onClick: async () => {
                    // Hand control of the program field back to detection so the
                    // resolved binary path overwrites whatever the user typed (or
                    // Reset reset to 'crush'). Escape hatch when auto-sync has
                    // gotten out of sync with reality.
                    programAutoManagedRef.current = true;
                    setCrushInstalled(null);
                    setDetectSource("re-detecting via which crush…");
                    const result = await detectCrushInstallation();
                    if (result) {
                      setCrushInstalled(result.installed);
                      setDetectSource(
                        result.path
                          ? `${result.via} → ${result.path}`
                          : (result.via || "which crush"),
                      );
                      if (result.installed && result.path) {
                        applyDetectedProgram(result.path);
                      }
                    }
                  },
                  title:
                    "Re-run which crush and sync the program field to the resolved path",
                  "aria-label": "Re-check Crush installation",
                },
                React.createElement(RefreshCw, {
                  size: 11,
                  "aria-hidden": true,
                }),
              ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "crush-runner-install-close",
                onClick: () => setInstallBannerDismissed(true),
                title: "Hide the install banner for this session",
                "aria-label": "Hide the install banner",
              },
              React.createElement(X, { size: 12, "aria-hidden": true }),
            ),
            React.createElement(
              "div",
              { className: "crush-runner-install-icon", "aria-hidden": true },
              crushInstalled === null
                ? React.createElement(RefreshCw, {
                  size: 18,
                  className: "crush-runner-install-spin",
                })
                : crushInstalled
                ? React.createElement(Rocket, { size: 18 })
                : React.createElement(Download, { size: 18 }),
            ),
            React.createElement(
              "div",
              { className: "crush-runner-install-body" },
              React.createElement(
                "div",
                { className: "crush-runner-install-title" },
                crushInstalled === null
                  ? "Checking Crush installation…"
                  : crushInstalled
                  ? `Crush is installed and ready to launch · ${
                    (detectSource.split(" → ")[0]) || "which crush"
                  }`
                  : "Crush is not installed",
              ),
              React.createElement(
                "p",
                { className: "crush-runner-install-copy" },
                crushInstalled === null
                  ? "Probing PATH via `which crush` to resolve the binary location."
                  : crushInstalled
                  ? React.createElement(
                    "span",
                    null,
                    "Resolved at ",
                    React.createElement(
                      "code",
                      null,
                      (detectSource.split(" → ")[1]) || "crush",
                    ),
                    ". Press Launch below to open a session with the configured profile.",
                  )
                  : React.createElement(
                    "span",
                    null,
                    "`which crush` returned no match. Trigger ",
                    React.createElement("code", null, "w9y mod apply crush"),
                    " to download and bind the Crush binary, then come back to launch it.",
                  ),
              ),
              crushInstalled !== true &&
                React.createElement(
                  "div",
                  { className: "crush-runner-install-actions" },
                  // Code chip first in source order so the column-reverse
                  // media query at narrow widths can stack chip-over-button
                  // without the DOM order and Tab key order diverging.
                  React.createElement("code", {
                    className: "crush-runner-install-cmd",
                  }, "$ w9y mod apply crush"),
                  React.createElement(
                    "button",
                    {
                      className:
                        "mkt-btn mkt-btn-primary crush-runner-install-btn",
                      type: "button",
                      onClick: handleInstall,
                      disabled: installing || crushInstalled === null,
                      "aria-label": "Install Crush",
                      title: crushInstalled === null
                        ? "Waiting for detection to finish"
                        : "Run w9y mod apply crush",
                    },
                    React.createElement(installing ? RefreshCw : Download, {
                      size: 14,
                      "aria-hidden": true,
                      className: installing
                        ? "crush-runner-install-spin"
                        : undefined,
                    }),
                    React.createElement(
                      "span",
                      null,
                      installing ? "Installing…" : "Install Crush",
                    ),
                  ),
                ),
            ),
          ),
        // Below the install banner we only show configuration controls when
        // Crush is actually installed. While the install probe is in flight
        // (null) or the binary is missing (false) we hide the rest of the
        // panel so the user focuses on resolving the install first.
        crushInstalled === true && React.createElement(
          React.Fragment,
          null,
          // Kicker surfaces the currently active preset name so the user
          // sees at a glance which configuration the page is editing. Sits
          // between the install banner (the diagnostic) and the preset bar
          // (the picker) so the eye flows: install OK → which preset? → Launch.
          // Preset switcher above the install banner: a grid of square
          // icon tiles that mirrors the settings panel's icon picker.
          // Each preset becomes a tappable tile (icon over name); the
          // New preset slot is a dashed-border tile with a Plus glyph.
          // Clicking a tile activates that preset; the active tile gets
          // the same blue ring the icon picker uses for its selection.
          React.createElement(
            "div",
            {
              className: "crush-runner-presets",
              role: "radiogroup",
              "aria-label": "Crush presets",
            },
            presets.map((preset) => {
              const Icon =
                (crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID")[preset.icon] ||
                  crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID").bot ||
                  crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID").terminal).icon;
              const isActive = preset.id === activePreset.id;
              return React.createElement(
                "button",
                {
                  key: preset.id,
                  type: "button",
                  role: "radio",
                  "aria-checked": isActive,
                  "aria-label": isActive
                    ? `Currently editing ${preset.name}`
                    : `Switch to ${preset.name}`,
                  className: `crush-runner-preset-tile${
                    isActive ? " selected" : ""
                  }${preset.builtin ? " builtin" : ""}`,
                  title: preset.builtin
                    ? `Built-in ${preset.name}`
                    : `${preset.name} preset`,
                  onClick: () => activatePreset(preset),
                },
                React.createElement(Icon, { size: 22, "aria-hidden": true }),
                React.createElement("span", {
                  className: "crush-runner-preset-tile-name",
                }, preset.name),
                preset.id === activePreset.id && isDirty &&
                  React.createElement("span", {
                    className: "crush-runner-preset-tile-dirty",
                    "aria-label": "Modified",
                    title: "Form differs from this preset",
                  }, "•"),
              );
            }),
            React.createElement(
              "button",
              {
                type: "button",
                className:
                  "crush-runner-preset-tile crush-runner-preset-tile-add",
                title: "Save current form as a new preset",
                "aria-label": "Save current form as a new preset",
                onClick: saveAsNewPreset,
              },
              React.createElement(Plus, { size: 22, "aria-hidden": true }),
              React.createElement("span", null, "New"),
            ),
          ),
          // Editor toggle: the configuration section starts hidden so
          // the default view reads as "ready to launch". The toggle
          // alone controls formExpanded — preset switches and saves
          // leave it alone so the editor stays open across changes.
          // Only available once Crush is installed, since editing
          // before that point is wasted work.
          crushInstalled === true &&
            React.createElement(
              "button",
              {
                type: "button",
                className: "crush-runner-editor-toggle",
                "aria-expanded": formExpanded,
                "aria-controls": "crush-runner-config",
                onClick: () => setFormExpanded((value) => !value),
              },
              React.createElement(SlidersHorizontal, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement(
                "span",
                null,
                formExpanded ? "Hide editor" : "Edit preset",
              ),
            ),
          crushInstalled === true && formExpanded && (() => {
            const tabs = [
              {
                id: "profile",
                label: "Profile",
                Icon: User,
                dirty: profileDirty,
                render: () =>
                  React.createElement(
                    "div",
                    {
                      className:
                        "crush-runner-section-body crush-runner-tab-panel",
                      "data-dirty": profileDirty || undefined,
                    },
                    React.createElement(
                      "div",
                      { className: "crush-runner-fields" },
                      React.createElement(
                        "label",
                        {
                          className: "crush-runner-icon-label",
                          htmlFor: "crush-runner-icon",
                        },
                        "Icon",
                      ),
                      React.createElement(
                        crushRunnerDep("TerminalPresetIconPicker"),
                        {
                          id: "crush-runner-icon",
                          value: draft.icon,
                          onChange: (icon) => updateField("icon", icon),
                        },
                      ),
                      React.createElement("label", {
                        htmlFor: "crush-runner-name",
                      }, "Preset name"),
                      React.createElement("input", {
                        id: "crush-runner-name",
                        type: "text",
                        value: draft.name,
                        spellCheck: false,
                        placeholder: "Crush",
                        onChange: (event) =>
                          updateField("name", event.target.value),
                      }),
                      React.createElement("label", {
                        htmlFor: "crush-runner-program",
                      }, "Program"),
                      React.createElement("input", {
                        id: "crush-runner-program",
                        type: "text",
                        value: draft.program,
                        spellCheck: false,
                        placeholder: "crush",
                        onChange: (event) => {
                          // Once the user starts editing the program field we leave
                          // it alone; detection results will no longer overwrite it.
                          programAutoManagedRef.current = false;
                          updateField("program", event.target.value);
                        },
                      }),
                      React.createElement("label", {
                        htmlFor: "crush-runner-args",
                      }, "Startup arguments"),
                      React.createElement("input", {
                        id: "crush-runner-args",
                        type: "text",
                        value: draft.args,
                        spellCheck: false,
                        placeholder: "--help",
                        onChange: (event) =>
                          updateField("args", event.target.value),
                      }),
                      React.createElement("label", {
                        htmlFor: "crush-runner-type",
                      }, "Runtime"),
                      React.createElement(
                        "select",
                        {
                          id: "crush-runner-type",
                          value: draft.type,
                          onChange: (event) =>
                            updateField("type", event.target.value),
                        },
                        React.createElement(
                          "option",
                          { value: "auto" },
                          "Auto",
                        ),
                        React.createElement(
                          "option",
                          { value: "gojs" },
                          "Go + JavaScript",
                        ),
                        React.createElement(
                          "option",
                          { value: "wasi" },
                          "WASI",
                        ),
                        React.createElement(
                          "option",
                          { value: "js" },
                          "JavaScript",
                        ),
                      ),
                      React.createElement(
                        "label",
                        { htmlFor: "crush-runner-wd" },
                        "Working directory",
                      ),
                      React.createElement("input", {
                        id: "crush-runner-wd",
                        type: "text",
                        value: draft.wd,
                        spellCheck: false,
                        placeholder: ".",
                        onChange: (event) =>
                          updateField("wd", event.target.value),
                      }),
                    ),
                    React.createElement(
                      "div",
                      { className: "crush-runner-section-actions" },
                      React.createElement(
                        "button",
                        {
                          className: "mkt-btn mkt-btn-ghost",
                          type: "button",
                          onClick: resetProfileFields,
                          disabled: !profileDirty,
                          title: "Restore profile fields to the saved preset",
                        },
                        React.createElement(RefreshCw, {
                          size: 14,
                          "aria-hidden": true,
                        }),
                        React.createElement("span", null, "Reset"),
                      ),
                    ),
                  ),
              },
              {
                id: "config",
                label: "crushrc",
                Icon: FileCode,
                dirty: configDirty,
                render: () =>
                  React.createElement(
                    "div",
                    {
                      className:
                        "crush-runner-section-body crush-runner-tab-panel",
                      "data-dirty": configDirty || undefined,
                    },
                    React.createElement(
                      "p",
                      { className: "hint" },
                      `Written to `,
                      React.createElement(
                        "code",
                        null,
                        `${crushConfigDirFor(params?.runnerId)}/crushrc`,
                      ),
                      ` right before launch, then exported as `,
                      React.createElement("code", null, "CRUSH_GLOBAL_CONFIG"),
                      ` so each CrushRunner instance has its own providers, models, and UI options.`,
                    ),
                    React.createElement("textarea", {
                      id: "crush-runner-crushrc",
                      className: "crush-runner-env crush-runner-crushrc",
                      value: crushrcContent,
                      spellCheck: false,
                      "aria-label": "crushrc contents",
                      placeholder: "AGW=...",
                      onChange: (event) =>
                        setCrushrcContent(event.target.value),
                    }),
                    React.createElement(
                      "div",
                      { className: "crush-runner-section-actions" },
                      React.createElement(
                        "button",
                        {
                          className: "mkt-btn mkt-btn-ghost",
                          type: "button",
                          onClick: resetCrushrcField,
                          disabled: !configDirty,
                          title: "Restore the built-in crushrc template",
                        },
                        React.createElement(RefreshCw, {
                          size: 14,
                          "aria-hidden": true,
                        }),
                        React.createElement("span", null, "Reset"),
                      ),
                    ),
                  ),
              },
              {
                id: "env",
                label: "Env",
                Icon: KeyRound,
                dirty: envDirty,
                render: () =>
                  React.createElement(
                    "div",
                    {
                      className:
                        "crush-runner-section-body crush-runner-tab-panel",
                    },
                    React.createElement(
                      "p",
                      { className: "hint crush-runner-hint" },
                      `Crush inherits the GearShell shell defaults (${
                        crushRunnerDep("WANIX")
                      }, ${
                        crushRunnerDep("HOME")
                      }, PATH, CRUSH_*, etc.). Add lines below to override or extend them in KEY=value format.`,
                    ),
                    React.createElement("textarea", {
                      id: "crush-runner-env",
                      className: "crush-runner-env",
                      value: draft.env,
                      spellCheck: false,
                      placeholder: "CRUSH_LOG=info\nOPENAI_API_KEY=...",
                      onChange: (event) =>
                        updateField("env", event.target.value),
                    }),
                    React.createElement(
                      "p",
                      { className: "hint" },
                      React.createElement(
                        "span",
                        {
                          className: "crush-runner-env-override-count",
                          "data-empty": envLines.length === 0
                            ? "true"
                            : "false",
                        },
                        envLines.length === 0
                          ? "Inherits built-ins"
                          : `${envLines.length} override${
                            envLines.length === 1 ? "" : "s"
                          }`,
                      ),
                      "Merged result: ",
                      React.createElement(
                        "code",
                        null,
                        `${
                          envLines.length === 0
                            ? "(no overrides)"
                            : envLines.join(" · ")
                        }`,
                      ),
                    ),
                    React.createElement(
                      "div",
                      { className: "crush-runner-section-actions" },
                      React.createElement(
                        "button",
                        {
                          className: "mkt-btn mkt-btn-ghost",
                          type: "button",
                          onClick: resetEnvField,
                          disabled: !envDirty,
                          title: "Restore env overrides to the saved preset",
                        },
                        React.createElement(RefreshCw, {
                          size: 14,
                          "aria-hidden": true,
                        }),
                        React.createElement("span", null, "Reset"),
                      ),
                    ),
                  ),
              },
              {
                id: "json",
                label: "JSON",
                Icon: Braces,
                dirty: jsonDraftDirty,
                render: () =>
                  React.createElement(
                    "div",
                    {
                      className:
                        "crush-runner-section-body crush-runner-tab-panel",
                      "data-dirty": jsonDraftDirty || undefined,
                    },
                    React.createElement(
                      "p",
                      { className: "hint" },
                      `Full preset snapshot (profile + crushrc), pretty-printed with 2-space indent. Edits sync into the other tabs; press the Reset to discard them.`,
                    ),
                    React.createElement("textarea", {
                      id: "crush-runner-json",
                      className:
                        "crush-runner-env crush-runner-crushrc crush-runner-json",
                      value: jsonDraft,
                      spellCheck: false,
                      "aria-label": "preset JSON contents",
                      placeholder: '{ "name": "Crush", ... }',
                      onChange: (event) => applyJsonEdit(event.target.value),
                    }),
                    React.createElement(
                      "div",
                      { className: "crush-runner-section-actions" },
                      React.createElement(
                        "button",
                        {
                          className: "mkt-btn mkt-btn-ghost",
                          type: "button",
                          onClick: resetJsonDraft,
                          disabled: !jsonDraftDirty,
                          title:
                            "Discard JSON edits and revert to the current form state",
                        },
                        React.createElement(RefreshCw, {
                          size: 14,
                          "aria-hidden": true,
                        }),
                        React.createElement("span", null, "Reset"),
                      ),
                      React.createElement(
                        "button",
                        {
                          className: "mkt-btn mkt-btn-ghost",
                          type: "button",
                          onClick: copyProfileJson,
                          title:
                            "Copy the current profile + crushrc to the clipboard for debugging or sharing",
                        },
                        React.createElement(Save, {
                          size: 14,
                          "aria-hidden": true,
                        }),
                        React.createElement("span", null, "Copy"),
                      ),
                    ),
                  ),
              },
            ];
            const activeEntry = tabs.find((tab) => tab.id === activeTab) ||
              tabs[0];
            const onTabKeyDown = (event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              const idx = tabs.findIndex((tab) => tab.id === activeTab);
              if (idx === -1) return;
              const nextIdx = event.key === "ArrowLeft"
                ? (idx - 1 + tabs.length) % tabs.length
                : (idx + 1) % tabs.length;
              event.preventDefault();
              setActiveTab(tabs[nextIdx].id);
            };
            return React.createElement(
              "section",
              {
                className: "crush-runner-config",
                id: "crush-runner-config",
              },
              React.createElement(
                "div",
                {
                  className: "crush-runner-tabs",
                  role: "tablist",
                  "aria-label": "Crush configuration",
                },
                tabs.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return React.createElement(
                    "button",
                    {
                      key: tab.id,
                      type: "button",
                      role: "tab",
                      id: `crush-runner-tab-${tab.id}`,
                      "aria-selected": isActive,
                      "aria-controls": "crush-runner-tab-panel",
                      tabIndex: isActive ? 0 : -1,
                      className: `crush-runner-tab${isActive ? " active" : ""}`,
                      onClick: () => setActiveTab(tab.id),
                      onKeyDown: onTabKeyDown,
                    },
                    tab.Icon &&
                      React.createElement(tab.Icon, {
                        size: 14,
                        "aria-hidden": true,
                      }),
                    React.createElement("span", {
                      className: "crush-runner-tab-label",
                    }, tab.label),
                    tab.dirty &&
                      React.createElement("span", {
                        className: "crush-runner-tab-dirty",
                        "aria-label": "Unsaved changes",
                        title: "Unsaved changes",
                      }, "*"),
                  );
                }),
              ),
              React.createElement("div", {
                className: "crush-runner-section crush-runner-tab-section",
                role: "tabpanel",
                id: "crush-runner-tab-panel",
                "aria-labelledby": `crush-runner-tab-${activeEntry.id}`,
              }, activeEntry.render()),
              // The dedicated Terminal preview section was redundant with the
              // Launch / Restart CTAs in the hero: every preview path opens a
              // Crush session in a real dockview tab, so collapsing the inline
              // overlay left no UI to render here. The "Copy profile JSON"
              // action moved down to the crushrc tab footer next to the
              // reset button so debugging tools stay next to the data they dump.
              React.createElement(
                "p",
                { className: "crush-runner-footer" },
                `Profile last refreshed ${
                  savedMarker === 0
                    ? "on first load"
                    : "after the most recent save"
                }. Changes live in this panel until you press “Save as default”.`,
              ),
            );
          })(),
        ),
        // CTA row pinned to the bottom of the panel so launching Crush is
        // the last thing the user reaches, regardless of which tab they
        // were editing. The destructive Remove preset button lives on the
        // left of the row (only for non-builtin presets); the save / copy
        // / launch actions stay right-aligned. Hidden entirely while Crush
        // install detection is in flight so the page focuses on the
        // banner above.
        crushInstalled === null ? null : React.createElement(
          "div",
          { className: "crush-runner-cta" },
          !activePreset.builtin && React.createElement(
            "button",
            {
              type: "button",
              className: "crush-runner-preset-remove",
              title: `Remove "${activePreset.name}" preset`,
              onClick: () => {
                if (
                  window.confirm(
                    `Remove preset "${activePreset.name}"? Built-in Crush will become active again.`,
                  )
                ) {
                  deleteActivePreset();
                }
              },
            },
            React.createElement(RefreshCw, { size: 13, "aria-hidden": true }),
            React.createElement("span", null, "Remove"),
          ),
          React.createElement(
            "div",
            { className: "crush-runner-cta-actions" },
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: saveUpdates,
                disabled: !isDirty,
                title:
                  `Save updates to the active preset "${activePreset.name}"`,
              },
              React.createElement(Save, { size: 16, "aria-hidden": true }),
              React.createElement("span", null, "Save"),
            ),
            // Primary CTA on the right: the page is the Crush runner, so the
            // brand is implied and "Launch" reads as "Launch Crush" without
            // the word repeating on every adjacent control.
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-primary crush-runner-launch",
                type: "button",
                onClick: launchCrush,
                disabled: crushInstalled !== true || installing,
                title: crushInstalled === null
                  ? "Checking…"
                  : crushInstalled === true
                  ? (commandPreview || "crush")
                  : "Install Crush first to enable launching",
                "aria-label": "Launch",
              },
              React.createElement(
                crushInstalled === null ? RefreshCw : Zap,
                {
                  size: 16,
                  "aria-hidden": true,
                  className: crushInstalled === null
                    ? "crush-runner-install-spin"
                    : undefined,
                },
              ),
              React.createElement(
                "span",
                null,
                crushInstalled === null ? "Checking…" : "Launch",
              ),
              crushInstalled !== null &&
                React.createElement(ArrowRight, {
                  size: 14,
                  "aria-hidden": true,
                }),
            ),
          ),
        ),
        // Status banner sits under the CTA row so a "Saved updates" or
        // "Reset profile fields" message appears right next to the button
        // that triggered it instead of floating above the form.
        React.createElement("p", {
          className: "crush-runner-status",
          role: "status",
          "aria-live": "polite",
          "data-error": status.isError || undefined,
          hidden: !status.message,
        }, status.message),
      ),
    ),
  );
}

// Counter for unique CrushRunner panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload. The saved
// snapshot path can hand us back an original id via addCrushRunnerPanel
// options; we then bump the counter past it so freshly added panels
// never collide with restored ids.
let crushRunnerIdCounter = 0;
// Per-panel launch counter so each panel's launches index sequentially
// off the panel id (panel #2 produces 2-1, 2-2, ...). Keeping the
// association explicit makes the running Crush instance's config dir
// visually traceable to the panel that spawned it.
const perPanelLaunchCount = Object.create(null);

// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.

// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.
export function addCrushRunnerPanel(api, group, options = {}) {
  // The restore-saved-panels path can hand us back the original panel id
  // so reloads keep the same numeric label on the Crush Runner tab;
  // otherwise we mint a fresh one from the module-level counter. When
  // restoring we also lift the counter past the restored id so a later
  // "new panel" action does not collide with it.
  const restoredId = Number(options.id);
  const id = Number.isFinite(restoredId) && restoredId > 0
    ? restoredId
    : ++crushRunnerIdCounter;
  if (Number.isFinite(restoredId) && restoredId > 0) {
    crushRunnerIdCounter = Math.max(crushRunnerIdCounter, restoredId);
  } else {
    crushRunnerIdCounter = Math.max(crushRunnerIdCounter, id);
  }
  const panel = api.addPanel({
    id: `crush-runner-${id}`,
    component: "crush-runner",
    params: { runnerId: id, panelType: "crush-runner" },
    title: `Crush Runner ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = crushRunnerDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "crush-runner", panelId: panel.id });
  panel.api.setActive();
  return panel;
}

export { CrushRunnerPanel };
