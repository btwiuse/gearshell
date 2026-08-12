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
  ArrowRight, Download, RefreshCw, Rocket, Save, Terminal as TerminalIcon, Zap,
} from 'lucide-react';

let __crushRunnerDeps = null;
export function initCrushRunner(dependencies) {
  __crushRunnerDeps = dependencies;
}
function crushRunnerDep(name) {
  if (__crushRunnerDeps == null) {
    throw new Error('crush-runner: initCrushRunner() has not been called; ensure app.js wires it in.');
  }
  const value = __crushRunnerDeps[name];
  if (value === undefined) {
    throw new Error(`crush-runner: missing dependency ${name}`);
  }
  return value;
}



function __getWanixSystem() {
  return document.getElementById('wanix-system');
}


const CRUSH_RUNNER_DEFAULT_PROFILE = {
  id: 'crush',
  name: 'Crush',
  program: 'crush',
  args: '',
  type: 'gojs',
  env: '',
  wd: '',
  icon: 'bot',
};
// Default Crush config written to `${CRUSH_GLOBAL_CONFIG}/crushrc` on
// launch. Each panel instance gets its own directory so concurrent Crush
// sessions do not stomp on each other's provider/model defaults. Users
// can edit this freely in the UI; the Reset button restores the seeded
// values below. Line continuations (`\`) carry through to the file
// verbatim, so every `provider add` keeps its multi-line shape.
const DEFAULT_CRUSHRC = [
  'AGW=https://agw.up.railway.app',
  '',
  // Use double quotes for the multi-line `provider add` entries so the
  // trailing line-continuation backslash does not escape the closing
  // quote. `${AGW}` stays a literal here because plain double-quoted
  // JS strings do not interpolate; crush will expand it at config-load.
  'provider add deepseek \\',
  '  --type openai-compat \\',
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  '',
  'provider add stepfun \\',
  '  --type openai-compat \\',
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  '',
  'provider add minimax-china \\',
  '  --type anthropic \\',
  '  --base-url "${AGW}/anthropic" \\',
  '  --api-key "-"',
  '',
  'model small deepseek/deepseek-v4-flash',
  'model large deepseek/deepseek-v4-flash',
  'model small stepfun/step-3.7-flash',
  'model large stepfun/step-3.7-flash',
  'model small minimax-china/MiniMax-M3',
  'model large minimax-china/MiniMax-M3',
  '',
  'option ui transparent false',
  '',
].join('\n');
function getCrushRunnerDefaults() {
  // Built-in defaults win; if the user previously saved overrides for the
  // crush profile via the terminal preset editor, surface those as the
  // starting point so this panel matches the rest of the app.
  const configured = crushRunnerDep("getTerminalProfiles")(crushRunnerDep("loadConfig")()).find((profile) => profile.id === 'crush');
  if (!configured) return { ...CRUSH_RUNNER_DEFAULT_PROFILE };
  const { id: _id, builtin: _builtin, ...rest } = configured;
  return { ...CRUSH_RUNNER_DEFAULT_PROFILE, ...rest };
}
// Pick a per-panel config directory under /tmp. Each CrushRunner instance
// owns its own directory so concurrent Crush launches don't fight over a
// shared ${CRUSH_GLOBAL_CONFIG}/crushrc. The path is derived from the
// runnerId the panel was registered with, which is stable across renders
// within the same panel.
function crushConfigDirFor(runnerId) {
  const safeId = Number.isFinite(Number(runnerId)) ? String(runnerId) : 'shared';
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
  const userEnv = (draft.env || '').trim();
  const lines = userEnv ? userEnv.split('\n').filter(Boolean) : [];
  const withoutConfig = lines.filter((line) => !/^CRUSH_GLOBAL_CONFIG\s*=/.test(line));
  const mergedEnv = [...withoutConfig, `CRUSH_GLOBAL_CONFIG=${configDir}`].join('\n');
  return {
    configDir,
    profile: {
      name: (draft.name || '').trim() || 'Crush',
      program: (draft.program || 'crush').trim(),
      args: (draft.args || '').trim(),
      type: draft.type || 'gojs',
      env: mergedEnv,
      wd: (draft.wd || '').trim(),
      icon: 'bot',
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
function spawnWanixCommand(cmd, { env = crushRunnerDep("buildEnv")(''), onError } = {}) {
  if (!__getWanixSystem()) throw new Error('Wanix system is not available.');
  const task = document.createElement('wanix-task');
  task.setAttribute('cmd', cmd);
  task.setAttribute('type', 'gojs');
  task.setAttribute('start', '');
  task.setAttribute('for', 'wanix-system');
  task.setAttribute('wd', '/');
  if (env) task.setAttribute('env', env);
  task.addEventListener('error', (event) => {
    onError?.(event.detail?.error || event.detail || new Error('Task failed to start.'));
  });
  __getWanixSystem().appendChild(task);
  return {
    task,
    dispose: () => { if (task.parentNode) task.parentNode.removeChild(task); },
  };
}

// Read a filesystem entry as text, returning null when the entry is missing
// or unreadable. Centralizes the decode logic so detection does not have to
// special-case string vs Uint8Array payloads.
async function readWanixText(path) {
  try {
    const data = await crushRunnerDep("getWanixRoot")().readFile(path);
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    return String(data ?? '');
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
  const markerPath = `/tmp/.crush-detect.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.txt`;
  try { await crushRunnerDep("getWanixRoot")().remove(markerPath); } catch { /* nothing to remove */ }
  let spawn;
  try {
    spawn = spawnWanixCommand(`hush -c "${CRUSH_DETECT_SCRIPT}"`, { env: crushRunnerDep("buildEnv")(`CRUSH_DETECT_OUT=${markerPath}`) });
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
        if (path.length > 0) whichResult = { installed: true, path, via: 'which crush' };
        else whichResult = { installed: false, via: 'which crush' };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!whichResult) whichResult = { installed: false, via: 'which crush (timeout)' };
  } finally {
    spawn?.dispose();
    try { await crushRunnerDep("getWanixRoot")().remove(markerPath); } catch { /* ignore */ }
  }
  // If `which crush` did not find the binary, check for the boot-time
  // install marker. The boot profile's w9y_detect skips re-installing once
  // the marker exists, which means a reload can leave the crush binding
  // missing from the namespace even though the install itself succeeded
  // previously. In that case surface the canonical install path so the
  // program field still points at the real binary.
  if (!whichResult.installed) {
    try {
      await crushRunnerDep("getWanixRoot")().readDir(`${crushRunnerDep("HOME")}/.w9y/crush`);
      return { installed: true, path: `${crushRunnerDep("WANIX")}/crush`, via: 'w9y marker (binary pending re-bind)' };
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
  const logPath = '/tmp/.crush-install.log';
  try { await crushRunnerDep("getWanixRoot")().remove(logPath); } catch { /* nothing to remove */ }
  const spawn = spawnWanixCommand(`hush -c "${CRUSH_INSTALL_SCRIPT}"`, { env: crushRunnerDep("buildEnv")(`CRUSH_INSTALL_LOG=${logPath}`) });
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
    return { installed: false, error: log ? `Crush install did not finish within 90 seconds.
${log.trim()}` : 'Crush install did not finish within 90 seconds.' };
  } finally {
    spawn?.dispose();
    try { await crushRunnerDep("getWanixRoot")().remove(logPath); } catch { /* ignore */ }
  }
}
function CrushRunnerPanel({ api, params, containerApi }) {
  const dockApi = containerApi || dockviewApi;
  const [draft, setDraft] = useState(() => getCrushRunnerDefaults());
  const [status, setStatus] = useState({ message: '', isError: false });
  const [savedMarker, setSavedMarker] = useState(0);
  // null = detection in flight, true = crush on PATH, false = missing.
  const [crushInstalled, setCrushInstalled] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [detectSource, setDetectSource] = useState('');
  // Tracks whether the user has manually edited the program field. Detection
  // and install both want to keep the program in sync with the real binary
  // path, but only as long as the user has not taken ownership of the field.
  const programAutoManagedRef = useRef(true);
  const applyDetectedProgram = (next) => {
    if (!programAutoManagedRef.current) return;
    if (!next) return;
    setDraft((current) => (current.program === next ? current : { ...current, program: next }));
  };
  // Per-panel crushrc content. Seeded with the built-in default; the user
  // edits it in-place and we write it out to ${CRUSH_GLOBAL_CONFIG}/crushrc
  // on launch. Each panel gets its own state so edits in one panel do not
  // leak into another.
  const [crushrcContent, setCrushrcContent] = useState(DEFAULT_CRUSHRC);
  const crushrcDirty = crushrcContent !== DEFAULT_CRUSHRC;
  // Collapsible inline terminal preview. Starts collapsed so the panel stays
  // calm until the user explicitly opts in. When opened, we spin up a real
  // <wanix-task>/<wanix-term> overlay anchored to a div inside this panel.
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalRestartToken, setTerminalRestartToken] = useState(0);
  const terminalAnchorRef = useRef(null);
  // The overlay machinery expects the *panel* api (onDidDimensionsChange,
  // onDidActiveChange, etc.), not the dockview root. Capture it in a ref
  // so the effect dependency list does not need to include `api`.
  const apiRef = useRef(null);
  if (apiRef.current === null && api) apiRef.current = api;
  // Mirror of `crushInstalled` for the wait loop below; the loop cannot
  // depend on the React state directly without re-spawning the session on
  // every detection tick. The render-side effect keeps this ref in sync.
  const crushInstalledRef = useRef(crushInstalled);
  crushInstalledRef.current = crushInstalled;
  useEffect(() => {
    let cancelled = false;
    let activeTask = 0;
    const detect = async () => {
      const id = ++activeTask;
      const result = await detectCrushInstallation();
      if (cancelled || id !== activeTask) return;
      if (result == null) {
        setCrushInstalled(null);
        setDetectSource('waiting for wanix');
      } else {
        setCrushInstalled(result.installed);
        setDetectSource(result.path ? `${result.via} → ${result.path}` : (result.via || 'which crush'));
        if (result.installed && result.path) applyDetectedProgram(result.path);
      }
    };
    detect();
    const onReady = () => detect();
    const onError = () => detect();
    // Re-run detection whenever the Wanix kernel finishes starting up; the
    // first useEffect tick often races the boot and would otherwise leave
    // the user staring at "Checking for crush…" forever.
    __getWanixSystem()?.addEventListener('ready', onReady);
    __getWanixSystem()?.addEventListener('error', onError);
    return () => {
      cancelled = true;
      __getWanixSystem()?.removeEventListener('ready', onReady);
      __getWanixSystem()?.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeTask = 0;
    const refresh = async () => {
      const id = ++activeTask;
      // Resetting the workspace also resets the form to defaults and gives
      // us a fresh chance to keep the program field in sync with detection
      // until the user takes ownership of it.
      programAutoManagedRef.current = true;
      setDraft(getCrushRunnerDefaults());
      setSavedMarker((value) => value + 1);
      const result = await detectCrushInstallation();
      if (cancelled || id !== activeTask) return;
      if (result) {
        setCrushInstalled(result.installed);
        setDetectSource(result.path ? `${result.via} → ${result.path}` : (result.via || 'which crush'));
        if (result.installed && result.path) applyDetectedProgram(result.path);
      }
    };
    const onReady = () => refresh();
    refresh();
    window.addEventListener(crushRunnerDep("WORKSPACE_CHANGED_EVENT"), refresh);
    __getWanixSystem()?.addEventListener('ready', onReady);
    return () => {
      cancelled = true;
      window.removeEventListener(crushRunnerDep("WORKSPACE_CHANGED_EVENT"), refresh);
      __getWanixSystem()?.removeEventListener('ready', onReady);
    };
  }, []);

  // Mount/unmount the inline terminal session when the section opens or
  // closes (or when the user clicks Restart). The session lives in the
  // global terminal-layer and is positioned over our anchor div via the
  // existing overlay machinery.
  //
  // Two timing pitfalls are deliberately handled here:
  //   1. Wanix kernel may not be ready yet; createTerminalSession spins up
  //      a wanix-task element which allocates wasm memory immediately, so we
  //      must wait for `systemReady` to avoid a flood of OOM failures.
  //   2. The anchor div has zero size until the <details> element actually
  //      opens, so we wait for a non-zero bounding box before attaching to
  //      dodge the xterm.js "onResize is null" race during activation.
  useEffect(() => {
    if (!terminalOpen) return undefined;
    const anchor = terminalAnchorRef.current;
    const api = apiRef.current;
    if (!anchor || !api) return undefined;
    const sessionId = `crush-runner-${params?.runnerId || 'preview'}-${terminalRestartToken}`;
    let cleanup = () => {};
    let cancelled = false;
    const start = async () => {
      if (cancelled) return;
      // Wait for the initial crush detection to settle so the spawned
      // shell uses the resolved program path (e.g. /opfs/wanix/crush)
      // instead of the default 'crush' that the form field starts with.
      // The detection writes to crushInstalledRef via a render-side
      // effect; polling the ref avoids adding crushInstalled to the deps.
      while (crushInstalledRef.current === null) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Wait for the kernel itself (not just the systemReady flag) so the
      // wanix-task element can actually instantiate wasm tasks; otherwise
      // we get "Cannot allocate Wasm memory" while the kernel boots.
      try {
        await crushRunnerDep("waitForWanixSystem")();
      } catch {
        return;
      }
      if (cancelled) return;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        requestAnimationFrame(start);
        return;
      }
      try {
        const { profile } = await prepareCrushLaunch(params?.runnerId || 'preview', draft, crushrcContent);
        const session = crushRunnerDep("createTerminalSession")(sessionId, profile);
        cleanup = crushRunnerDep("attachOverlayTerminalSession")(session, anchor, api);
      } catch (error) {
        crushRunnerDep("destroyTerminalSession")(sessionId);
      }
    };
    start();
    return () => {
      cancelled = true;
      cleanup();
      crushRunnerDep("destroyTerminalSession")(sessionId);
    };
  }, [terminalOpen, dockApi, terminalRestartToken]);

  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  // Tear down the current session so the useEffect re-runs with the
  // latest draft/crushrc; prepareCrushLaunch picks those up and
  // re-writes ${CRUSH_GLOBAL_CONFIG}/crushrc before spawning the shell.
  const restartInlineTerminal = () => {
    setTerminalRestartToken((value) => value + 1);
  };

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    setStatus({ message: 'Installing Crush via `w9y mod apply crush`…', isError: false });
    try {
      const result = await installCrushViaW9y();
      if (!result.installed) {
        setCrushInstalled(false);
        setStatus({ message: result.error || 'Crush install did not complete.', isError: true });
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
      setDetectSource(`w9y marker present; binary at ${installedPath}`);
      setStatus({ message: 'Crush installed. You can launch it now.', isError: false });
    } catch (error) {
      setCrushInstalled(false);
      setStatus({ message: error.message || 'Failed to install Crush.', isError: true });
    } finally {
      setInstalling(false);
    }
  };

  const defaults = CRUSH_RUNNER_DEFAULT_PROFILE;
  const isDirty = ['name', 'program', 'args', 'type', 'env', 'wd', 'icon'].some(
    (field) => (draft[field] || '') !== (defaults[field] || ''),
  );

  const commandPreview = [draft.program, draft.args].filter(Boolean).join(' ').trim();
  const envLines = (draft.env || '').split('\n').map((line) => line.trim()).filter(Boolean);

  const launchCrush = async (event) => {
    if (event) event.preventDefault();
    if (!dockApi) return;
    setStatus({ message: `Writing ${crushConfigDirFor(params?.runnerId)}/crushrc…`, isError: false });
    try {
      const { configDir, profile } = await prepareCrushLaunch(params?.runnerId, draft, crushrcContent);
      crushRunnerDep("addTerminalPanel")(dockApi, undefined, profile);
      setStatus({
        message: `Launched ${profile.program}${profile.args ? ' ' + profile.args : ''} with CRUSH_GLOBAL_CONFIG=${configDir}.`,
        isError: false,
      });
    } catch (error) {
      setStatus({ message: error.message || 'Failed to launch Crush.', isError: true });
    }
  };

  const saveAsDefault = () => {
    try {
      const config = crushRunnerDep("loadConfig")();
      const profiles = config.terminalProfiles.filter((profile) => profile.id !== 'crush');
      const nextProfile = crushRunnerDep("normalizeTerminalProfile")({ ...CRUSH_RUNNER_DEFAULT_PROFILE, ...draft });
      const nextProfiles = [nextProfile, ...profiles];
      crushRunnerDep("saveTerminalProfiles")(
        nextProfiles,
        config.defaultTerminalProfileId,
        crushRunnerDep("normalizeTerminalProfileOrder")(config.terminalProfileOrder, nextProfiles),
      );
      setSavedMarker((value) => value + 1);
      setStatus({ message: 'Saved current settings as the Crush default.', isError: false });
    } catch (error) {
      setStatus({ message: error.message || 'Unable to save the Crush defaults.', isError: true });
    }
  };

  const resetToDefaults = () => {
    setDraft({ ...CRUSH_RUNNER_DEFAULT_PROFILE });
    // Hand control of the program field back to detection: any future
    // detection that finds a binary should overwrite the freshly-reset
    // 'crush' placeholder with the resolved path.
    programAutoManagedRef.current = true;
    try {
      const config = crushRunnerDep("loadConfig")();
      const profiles = config.terminalProfiles.filter((profile) => profile.id !== 'crush');
      const remaining = profiles.length === config.terminalProfiles.length;
      if (remaining) {
        setStatus({ message: 'Restored the built-in Crush defaults.', isError: false });
        return;
      }
      crushRunnerDep("saveTerminalProfiles")(
        profiles,
        config.defaultTerminalProfileId,
        crushRunnerDep("normalizeTerminalProfileOrder")(config.terminalProfileOrder, profiles),
      );
      setSavedMarker((value) => value + 1);
      setStatus({ message: 'Cleared saved overrides and restored built-in Crush defaults.', isError: false });
    } catch (error) {
      setStatus({ message: error.message || 'Unable to reset the Crush defaults.', isError: true });
    }
  };

  return React.createElement('div', { className: 'crush-runner-panel panel-content' },
    React.createElement('div', { className: 'crush-runner-shell' },
      // Hero mirrors the landing page so launching Crush feels like pressing
      // the Open Terminal CTA: kicker, headline, lede, primary CTA, ghost CTA.
      React.createElement('header', { className: 'crush-runner-hero' },
        React.createElement('div', { className: 'crush-runner-kicker' }, 'CRUSH · CONFIGURATION'),
        React.createElement('h1', null, 'Run Crush your way.'),
        React.createElement('p', { className: 'crush-runner-lede' },
          'Pick the program, arguments, runtime, and environment for the Crush agent before you launch it. Save the result as the default for next time, or reset to the built-ins.',
        ),
        React.createElement('div', {
          className: 'crush-runner-install',
          'data-state': crushInstalled === null
            ? 'checking'
            : crushInstalled
              ? 'installed'
              : 'missing',
          hidden: crushInstalled !== false,
        },
          React.createElement('div', { className: 'crush-runner-install-icon', 'aria-hidden': true },
            React.createElement(Download, { size: 20 }),
          ),
          React.createElement('div', { className: 'crush-runner-install-body' },
            React.createElement('div', { className: 'crush-runner-install-title' }, 'Crush is not installed'),
            React.createElement('p', { className: 'crush-runner-install-copy' },
              '`which crush` returned no match. Trigger ',
              React.createElement('code', null, 'w9y mod apply crush'),
              ' to download and bind the Crush binary, then come back to launch it.',
            ),
            React.createElement('div', { className: 'crush-runner-install-actions' },
              React.createElement('button', {
                className: 'mkt-btn mkt-btn-primary crush-runner-install-btn',
                type: 'button',
                onClick: handleInstall,
                disabled: installing,
                'aria-label': 'Install Crush',
                title: 'Run w9y mod apply crush',
              },
                React.createElement(installing ? RefreshCw : Download, { size: 16, 'aria-hidden': true, className: installing ? 'crush-runner-install-spin' : undefined }),
                React.createElement('span', null, installing ? 'Installing…' : 'Install Crush'),
              ),
              React.createElement('code', { className: 'crush-runner-install-cmd' }, '$ w9y mod apply crush'),
            ),
          ),
        ),
        React.createElement('div', {
          className: 'crush-runner-detect',
          'data-state': crushInstalled === null
            ? 'checking'
            : crushInstalled
              ? 'installed'
              : 'missing',
        },
          React.createElement('span', {
            className: `crush-runner-detect-dot ${crushInstalled === null ? 'pending' : ''}`,
            'aria-hidden': true,
          }),
          React.createElement('span', null,
            crushInstalled === null
              ? `Checking for crush… (${detectSource})`
              : crushInstalled
                ? `which crush → installed (${detectSource})`
                : `which crush → not found (${detectSource})`,
          ),
          !installing && React.createElement('button', {
            className: 'crush-runner-detect-recheck',
            type: 'button',
            disabled: crushInstalled === null,
            onClick: async () => {
              // Hand control of the program field back to detection so the
              // resolved binary path overwrites whatever the user typed (or
              // Reset reset to 'crush'). This is the escape hatch when the
              // auto-sync has gotten out of sync with reality.
              programAutoManagedRef.current = true;
              setCrushInstalled(null);
              setDetectSource('re-detecting via which crush…');
              const result = await detectCrushInstallation();
              if (result) {
                setCrushInstalled(result.installed);
                setDetectSource(result.path ? `${result.via} → ${result.path}` : (result.via || 'which crush'));
                if (result.installed && result.path) applyDetectedProgram(result.path);
              }
            },
            title: 'Re-run which crush and sync the program field to the resolved path',
          },
            React.createElement(RefreshCw, { size: 13, 'aria-hidden': true }),
          ),
        ),
        React.createElement('div', { className: 'crush-runner-cta' },
          React.createElement('button', {
            className: 'mkt-btn mkt-btn-primary crush-runner-launch',
            type: 'button',
            onClick: launchCrush,
            disabled: crushInstalled !== true || installing,
            title: crushInstalled === true
              ? (commandPreview || 'crush')
              : 'Install Crush first to enable launching',
            'aria-label': 'Launch Crush',
          },
            React.createElement(Zap, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'Launch Crush'),
            React.createElement(ArrowRight, { size: 14, 'aria-hidden': true }),
          ),
          React.createElement('button', {
            className: 'mkt-btn mkt-btn-ghost',
            type: 'button',
            onClick: saveAsDefault,
            disabled: !isDirty,
            title: 'Save the current settings as the persisted Crush default',
          },
            React.createElement(Save, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'Save as default'),
          ),
          React.createElement('button', {
            className: 'mkt-btn mkt-btn-ghost',
            type: 'button',
            onClick: resetToDefaults,
            title: 'Discard edits and revert to the built-in Crush defaults',
          },
            React.createElement(RefreshCw, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'Reset'),
          ),
        ),
        React.createElement('div', { className: 'crush-runner-meta' },
          React.createElement('span', { className: 'crush-runner-meta-label' }, 'Command preview'),
          React.createElement('code', { className: 'crush-runner-command' }, commandPreview || 'crush'),
        ),
        React.createElement('p', {
          className: 'crush-runner-status',
          role: 'status',
          'aria-live': 'polite',
          'data-error': status.isError || undefined,
          hidden: !status.message,
        }, status.message),
      ),
      // Form section: editable mirror of every field on the underlying
      // terminal profile, grouped into details panels so the layout stays
      // calm even on narrow windows.
      React.createElement('section', { className: 'crush-runner-config' },
        React.createElement('details', { className: 'crush-runner-section', open: true },
          React.createElement('summary', null,
            React.createElement('span', null, 'Default launch configuration'),
            React.createElement('span', { className: 'crush-runner-section-tag' },
              isDirty ? 'Edited locally' : 'Built-in defaults',
            ),
          ),
          React.createElement('div', { className: 'crush-runner-section-body' },
            React.createElement('div', { className: 'crush-runner-fields' },
              React.createElement('label', { htmlFor: 'crush-runner-name' }, 'Preset name'),
              React.createElement('input', {
                id: 'crush-runner-name',
                type: 'text',
                value: draft.name,
                spellCheck: false,
                placeholder: 'Crush',
                onChange: (event) => updateField('name', event.target.value),
              }),
              React.createElement('label', { htmlFor: 'crush-runner-program' }, 'Program'),
              React.createElement('input', {
                id: 'crush-runner-program',
                type: 'text',
                value: draft.program,
                spellCheck: false,
                placeholder: 'crush',
                onChange: (event) => {
                  // Once the user starts editing the program field we leave
                  // it alone; detection results will no longer overwrite it.
                  programAutoManagedRef.current = false;
                  updateField('program', event.target.value);
                },
              }),
              React.createElement('label', { htmlFor: 'crush-runner-args' }, 'Startup arguments'),
              React.createElement('input', {
                id: 'crush-runner-args',
                type: 'text',
                value: draft.args,
                spellCheck: false,
                placeholder: '--help',
                onChange: (event) => updateField('args', event.target.value),
              }),
              React.createElement('label', { htmlFor: 'crush-runner-type' }, 'Runtime'),
              React.createElement('select', {
                id: 'crush-runner-type',
                value: draft.type,
                onChange: (event) => updateField('type', event.target.value),
              },
                React.createElement('option', { value: 'auto' }, 'Auto'),
                React.createElement('option', { value: 'gojs' }, 'Go + JavaScript'),
                React.createElement('option', { value: 'wasi' }, 'WASI'),
                React.createElement('option', { value: 'js' }, 'JavaScript'),
              ),
              React.createElement('label', { htmlFor: 'crush-runner-wd' }, 'Working directory'),
              React.createElement('input', {
                id: 'crush-runner-wd',
                type: 'text',
                value: draft.wd,
                spellCheck: false,
                placeholder: '.',
                onChange: (event) => updateField('wd', event.target.value),
              }),
            ),
          ),
        ),
        React.createElement('details', { className: 'crush-runner-section', open: true },
          React.createElement('summary', null,
            React.createElement('span', null, 'Crush config (crushrc)'),
            React.createElement('span', { className: 'crush-runner-section-tag' },
              crushrcDirty ? 'Edited locally' : 'Built-in defaults',
            ),
          ),
          React.createElement('div', { className: 'crush-runner-section-body' },
            React.createElement('p', { className: 'hint' },
              `Written to `,
              React.createElement('code', null, `${crushConfigDirFor(params?.runnerId)}/crushrc`),
              ` right before launch, then exported as `,
              React.createElement('code', null, 'CRUSH_GLOBAL_CONFIG'),
              ` so each CrushRunner instance has its own providers, models, and UI options.`,
            ),
            React.createElement('textarea', {
              id: 'crush-runner-crushrc',
              className: 'crush-runner-env crush-runner-crushrc',
              value: crushrcContent,
              spellCheck: false,
              'aria-label': 'crushrc contents',
              placeholder: 'AGW=...',
              onChange: (event) => setCrushrcContent(event.target.value),
            }),
            React.createElement('div', { className: 'crush-runner-section-actions' },
              React.createElement('button', {
                className: 'crush-runner-detect-recheck',
                type: 'button',
                onClick: () => setCrushrcContent(DEFAULT_CRUSHRC),
                disabled: !crushrcDirty,
                title: 'Restore the built-in crushrc template',
              },
                React.createElement(RefreshCw, { size: 13, 'aria-hidden': true }),
                React.createElement('span', { style: { marginLeft: '6px' } }, 'Reset to defaults'),
              ),
            ),
          ),
        ),
        React.createElement('details', { className: 'crush-runner-section', open: true },
          React.createElement('summary', null,
            React.createElement('span', null, 'Environment variables'),
            React.createElement('span', { className: 'crush-runner-section-tag' },
              envLines.length === 0 ? 'Inherits built-ins' : `${envLines.length} override${envLines.length === 1 ? '' : 's'}`,
            ),
          ),
          React.createElement('div', { className: 'crush-runner-section-body' },
            React.createElement('p', { className: 'hint crush-runner-hint' },
              'Crush inherits the GearShell shell defaults (crushRunnerDep("WANIX"), crushRunnerDep("HOME"), PATH, CRUSH_*, etc.). Add lines below to override or extend them in KEY=value format.',
            ),
            React.createElement('textarea', {
              id: 'crush-runner-env',
              className: 'crush-runner-env',
              value: draft.env,
              spellCheck: false,
              placeholder: 'CRUSH_LOG=info\nOPENAI_API_KEY=...',
              onChange: (event) => updateField('env', event.target.value),
            }),
            React.createElement('p', { className: 'hint' },
              'Merged result: ',
              React.createElement('code', null, `${envLines.length === 0 ? '(no overrides)' : envLines.join(' · ')}`),
            ),
          ),
        ),
        React.createElement('details', { className: 'crush-runner-section' },
          React.createElement('summary', null,
            React.createElement('span', null, 'Advanced'),
            React.createElement('span', { className: 'crush-runner-section-tag' }, 'Icon'),
          ),
          React.createElement('div', { className: 'crush-runner-section-body' },
            React.createElement('p', { className: 'hint' },
              'Choose the Lucide icon used for this preset in the terminal launcher. The Crush agent ships with the Bot icon by default.',
            ),
            React.createElement(crushRunnerDep("TerminalPresetIconPicker"), {
              value: draft.icon,
              onChange: (icon) => updateField('icon', icon),
            }),
          ),
        ),
        React.createElement('details', {
          className: 'crush-runner-section crush-runner-terminal-section',
          open: terminalOpen,
          onToggle: (event) => setTerminalOpen(event.currentTarget.open),
        },
          React.createElement('summary', null,
            React.createElement('span', null, 'Terminal preview'),
            React.createElement('span', { className: 'crush-runner-section-tag' },
              terminalOpen ? 'Running' : 'Closed',
            ),
          ),
          React.createElement('div', { className: 'crush-runner-section-body' },
            React.createElement('p', { className: 'hint' },
              'Opens a headless Crush terminal inline. The session uses the profile above; edits do not take effect until you ',
              React.createElement('strong', null, 'Restart terminal'),
              '.',
            ),
            React.createElement('div', { className: 'crush-runner-terminal-anchor', ref: terminalAnchorRef }),
            terminalOpen && React.createElement('div', { className: 'crush-runner-section-actions' },
              React.createElement('button', {
                className: 'crush-runner-detect-recheck',
                type: 'button',
                onClick: restartInlineTerminal,
                title: 'Tear down the current session and spawn a new one with the latest profile',
              },
                React.createElement(RefreshCw, { size: 13, 'aria-hidden': true }),
                React.createElement('span', { style: { marginLeft: '6px' } }, 'Restart terminal'),
              ),
            ),
          ),
        ),
        React.createElement('p', { className: 'crush-runner-footer' },
          `Profile last refreshed ${savedMarker === 0 ? 'on first load' : 'after the most recent save'}. Changes live in this panel until you press “Save as default”.`,
        ),
      ),
    ),
  );
}


// Counter for unique CrushRunner panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload.
let crushRunnerIdCounter = 0;

// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.


// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.
export function addCrushRunnerPanel(api, group) {
  const id = ++crushRunnerIdCounter;
  const panel = api.addPanel({
    id: `crush-runner-${id}`,
    component: 'crush-runner',
    params: { runnerId: id, panelType: 'crush-runner' },
    title: `Crush Runner ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = crushRunnerDep('rememberOpenPanel');
  rememberOpenPanel(panel, { component: 'crush-runner' });
  panel.api.setActive();
  return panel;
}

export { CrushRunnerPanel };
