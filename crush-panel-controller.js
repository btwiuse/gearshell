// Controller hook for the Crush Runner panel: owns the panel's state and
// the shared handlers (install flow, launch flow, dirty tracking), and
// composes the JSON-editor and preset-CRUD hooks. The component and the
// section sub-components only ever read the returned `ctl` object, so the
// JSX stays in small, focused files (500-line rule).

import React, { useEffect, useRef, useState } from "react";

import {
  __getWanixSystem,
  crushRunnerDep,
  perPanelLaunchCount,
} from "./crush-deps.js?v=20260828.3";
import {
  CRUSH_RUNNER_DEFAULT_PROFILE,
  DEFAULT_CRUSHRC,
  getCrushRunnerCrushrcFor,
  getCrushRunnerDefaults,
} from "./crush-presets.js?v=20260826.2";
import {
  crushRunDirFor,
  prepareCrushLaunch,
} from "./crush-config.js?v=20260826.2";
import {
  detectCrushInstallation,
  installCrushViaW9y,
} from "./crush-install.js?v=20260828.78";
import { useCrushJsonEdit } from "./crush-json-edit.js?v=20260826.3";
import { useCrushPresetCrud } from "./crush-preset-crud.js?v=20260826.3";

function makeCrushDetector(
  { setCrushInstalled, setDetectSource, applyDetectedProgram },
) {
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
  return detect;
}

function makeWorkspaceChangeHandler({ setPresets, switchToPreset, detect }) {
  // Workspace changes also need to reset the form to the active preset
  // and give us a fresh chance to keep the program field in sync with
  // detection until the user takes ownership of it.
  return () => {
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
}

function subscribeCrushEvents({ detect, onWorkspaceChange }) {
  // Re-run detection whenever the Wanix kernel finishes starting up; the
  // first detect() call often races the boot and would otherwise leave
  // the user staring at "Checking for crush…" forever.
  const onReady = () => detect();
  const onError = () => detect();
  __getWanixSystem()?.addEventListener("ready", onReady);
  __getWanixSystem()?.addEventListener("error", onError);
  window.addEventListener(
    crushRunnerDep("WORKSPACE_CHANGED_EVENT"),
    onWorkspaceChange,
  );
  detect();
  return () => {
    __getWanixSystem()?.removeEventListener("ready", onReady);
    __getWanixSystem()?.removeEventListener("error", onError);
    window.removeEventListener(
      crushRunnerDep("WORKSPACE_CHANGED_EVENT"),
      onWorkspaceChange,
    );
  };
}

// Form state for the Crush Runner panel: the preset list, the active
// preset, the in-form draft and crushrc content, and preset switching.
// Re-reads the preset list from config; other panels editing the config
// surface the new ordering through WORKSPACE_CHANGED_EVENT (the install
// hook's effect) without a page reload.
function useCrushRunnerFormState({ programAutoManagedRef }) {
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
  // Per-panel crushrc content. Seeded from the active preset (which falls
  // back to the built-in default); the user edits it in-place and we write
  // it out to ${CRUSH_GLOBAL_CONFIG}/crushrc on launch. Each panel gets its
  // own state so edits in one panel do not leak into another.
  const [crushrcContent, setCrushrcContent] = useState(() =>
    getCrushRunnerCrushrcFor(activePreset)
  );
  const [savedMarker, setSavedMarker] = useState(0);
  const crushrcDirty =
    crushrcContent !== getCrushRunnerCrushrcFor(activePreset);
  const switchToPreset = (preset) => {
    setDraft(getCrushRunnerDefaults(preset));
    setCrushrcContent(getCrushRunnerCrushrcFor(preset));
    setSavedMarker((value) => value + 1);
    programAutoManagedRef.current = true;
  };
  return {
    presets,
    setPresets,
    activePreset,
    draft,
    setDraft,
    crushrcContent,
    setCrushrcContent,
    savedMarker,
    setSavedMarker,
    crushrcDirty,
    switchToPreset,
  };
}

async function performCrushInstall({
  setCrushInstalled,
  setDetectSource,
  setStatus,
  applyDetectedProgram,
}) {
  setStatus({
    message: "Installing Crush via `w9y mod apply crush`…",
    isError: false,
  });
  try {
    const result = await installCrushViaW9y();
    if (!result.ok) {
      setCrushInstalled(false);
      setStatus({
        message: result.error || "Crush install did not start.",
        isError: true,
      });
      return;
    }
    // w9y installs crush at ${WANIX}/crush; mirror that exact path so
    // the program field points at the real binary. A follow-up probe
    // races the namespace binding, so don't re-detect here — the user
    // can hit re-check if they want a probe.
    const installedPath = `${crushRunnerDep("WANIX")}/crush`;
    applyDetectedProgram(installedPath);
    setCrushInstalled(true);
    setDetectSource(`installed by w9y at ${installedPath}`);
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
  }
}

// Detection + install state for the panel: the install banner states,
// the auto-managed program field, and the kernel-ready/workspace-change
// subscription that keeps detection fresh.
function useCrushInstallState({
  setDraft,
  setPresets,
  switchToPreset,
  programAutoManagedRef,
  setStatus,
}) {
  const [crushInstalled, setCrushInstalled] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [detectSource, setDetectSource] = useState("");
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const applyDetectedProgram = (next) => {
    if (!programAutoManagedRef.current) return;
    if (!next) return;
    setDraft((
      current,
    ) => (current.program === next ? current : { ...current, program: next }));
  };
  useEffect(() => {
    const detect = makeCrushDetector({
      setCrushInstalled,
      setDetectSource,
      applyDetectedProgram,
    });
    const onWorkspaceChange = makeWorkspaceChangeHandler({
      setPresets,
      switchToPreset,
      detect,
    });
    return subscribeCrushEvents({ detect, onWorkspaceChange });
  }, []);
  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    await performCrushInstall({
      setCrushInstalled,
      setDetectSource,
      setStatus,
      applyDetectedProgram,
    });
    setInstalling(false);
  };
  return {
    crushInstalled,
    setCrushInstalled,
    installing,
    setInstalling,
    detectSource,
    setDetectSource,
    installBannerDismissed,
    setInstallBannerDismissed,
    applyDetectedProgram,
    handleInstall,
  };
}

// Per-tab dirty state so the asterisk on each tab reflects the inputs
// that tab actually edits. Profile owns name/icon/program/args/type/wd,
// Config owns crushrc, Env owns env.
function computeCrushDirtyState(form) {
  const { activePreset, draft, crushrcContent, crushrcDirty } = form;
  const base = activePreset || CRUSH_RUNNER_DEFAULT_PROFILE;
  const field = (name) =>
    (draft[name] || "") !==
      ((base[name] == null ? CRUSH_RUNNER_DEFAULT_PROFILE[name] : base[name]) ||
        "");
  const isDirty = crushrcContent !== (base.crushrc || DEFAULT_CRUSHRC) ||
    ["name", "icon", "program", "args", "type", "env", "wd"].some(field);
  const profileDirty = isDirty &&
    ["name", "icon", "program", "args", "type", "wd"].some(field);
  const envDirty = field("env");
  return { isDirty, profileDirty, envDirty, configDirty: crushrcDirty };
}

// Open a fresh Crush terminal in a new dockview tab. Used by both the
// hero Launch button and the preview section's "Open in new panel"
// action so the two flows stay in lock-step.
async function launchCrushPanel({
  dockApi,
  panelId,
  draft,
  crushrcContent,
  setStatus,
  source,
}) {
  // The task-visible rcfile mount is a fixed path (/preset/crushrc,
  // see CRUSH_RUN_DIR in crush-config.js): isolation comes from wanix
  // giving each task its own copy-on-write namespace, so every Launch
  // mints a new task with a fresh ramfs and never touches a running
  // instance. We still mint a per-launch id so the status messages can
  // tell launches apart, and so any future write through the shared
  // kernel-root /tmp (the legacy /tmp/crush-runner-<id> path) stays
  // per-launch unique.
  const baseId = Number.isFinite(panelId) && panelId > 0 ? panelId : 1;
  const nextIndex = (perPanelLaunchCount[baseId] || 0) + 1;
  perPanelLaunchCount[baseId] = nextIndex;
  const launchId = `${baseId}-${nextIndex}`;
  const configDir = crushRunDirFor(launchId);
  setStatus({
    message: `Mounting /${configDir}/crushrc…`,
    isError: false,
  });
  try {
    const { profile } = await prepareCrushLaunch(
      launchId,
      draft,
      crushrcContent,
    );
    crushRunnerDep("addTerminalPanel")(dockApi, undefined, profile);
    setStatus({
      message: `Launched ${profile.program}${
        profile.args ? " " + profile.args : ""
      } with rcfile mounted at /${configDir}/crushrc${
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
}

// Compose the JSON-editor and preset-CRUD hooks (each a sub-50-line
// hook in its own module) and merge their ctl surfaces.
function useCrushComposed({
  form,
  setStatus,
  programAutoManagedRef,
  updateField,
  params,
}) {
  const jsonEdit = useCrushJsonEdit({
    draft: form.draft,
    setDraft: form.setDraft,
    activePreset: form.activePreset,
    crushrcContent: form.crushrcContent,
    setCrushrcContent: form.setCrushrcContent,
    setStatus,
  });
  const presetCrud = useCrushPresetCrud({
    activePreset: form.activePreset,
    draft: form.draft,
    setDraft: form.setDraft,
    crushrcContent: form.crushrcContent,
    setCrushrcContent: form.setCrushrcContent,
    setPresets: form.setPresets,
    setSavedMarker: form.setSavedMarker,
    setStatus,
    switchToPreset: form.switchToPreset,
    programAutoManagedRef,
    updateField,
    params,
  });
  return { ...jsonEdit, ...presetCrud };
}

function makeOpenCrushLauncher(
  { dockApi, panelId, draft, crushrcContent, setStatus },
) {
  return ({ source } = {}) => {
    if (!dockApi) return undefined;
    return launchCrushPanel({
      dockApi,
      panelId,
      draft,
      crushrcContent,
      setStatus,
      source,
    });
  };
}

// Panel chrome state: status banner, the Profile/Config/Env tab, the
// collapsed/expanded form toggle, the field updater, and the launch
// preview strings derived from the draft.
function useCrushPanelUiState({ setDraft, draft }) {
  const [status, setStatus] = useState({ message: "", isError: false });
  const [activeTab, setActiveTab] = useState("profile");
  const [formExpanded, setFormExpanded] = useState(false);
  const updateField = (field, value) => setDraftSafe(setDraft, field, value);
  const commandPreview = [draft.program, draft.args].filter(Boolean)
    .join(" ").trim();
  const envLines = (draft.env || "").split("\n").map((line) => line.trim())
    .filter(Boolean);
  return {
    status,
    setStatus,
    activeTab,
    setActiveTab,
    formExpanded,
    setFormExpanded,
    updateField,
    commandPreview,
    envLines,
  };
}

export function useCrushRunnerPanelController({ api, params, containerApi }) {
  const dockApi = containerApi || dockviewApi;
  const programAutoManagedRef = useRef(true);
  const form = useCrushRunnerFormState({ programAutoManagedRef });
  const ui = useCrushPanelUiState({
    setDraft: form.setDraft,
    draft: form.draft,
  });
  const install = useCrushInstallState({
    setDraft: form.setDraft,
    setPresets: form.setPresets,
    switchToPreset: form.switchToPreset,
    programAutoManagedRef,
    setStatus: ui.setStatus,
  });
  const dirty = computeCrushDirtyState(form);
  const openCrushInNewPanel = makeOpenCrushLauncher({
    dockApi,
    panelId: params?.runnerId,
    draft: form.draft,
    crushrcContent: form.crushrcContent,
    setStatus: ui.setStatus,
  });
  const launchCrush = (event) => {
    if (event) event.preventDefault();
    openCrushInNewPanel({ source: "launch" });
  };
  const composed = useCrushComposed({
    form,
    setStatus: ui.setStatus,
    programAutoManagedRef,
    updateField: ui.updateField,
    params,
  });
  return {
    api,
    params,
    containerApi,
    dockApi,
    programAutoManagedRef,
    ...form,
    ...install,
    ...dirty,
    ...ui,
    ...composed,
    openCrushInNewPanel,
    launchCrush,
  };
}

function setDraftSafe(setDraft, field, value) {
  setDraft((current) => ({ ...current, [field]: value }));
}
