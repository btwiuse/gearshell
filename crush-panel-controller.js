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
} from "./crush-deps.js?v=20260826.1";
import {
  CRUSH_RUNNER_DEFAULT_PROFILE,
  DEFAULT_CRUSHRC,
  getCrushRunnerCrushrcFor,
  getCrushRunnerDefaults,
} from "./crush-presets.js?v=20260826.1";
import {
  crushRunDirFor,
  prepareCrushLaunch,
} from "./crush-config.js?v=20260826.1";
import {
  detectCrushInstallation,
  installCrushViaW9y,
} from "./crush-install.js?v=20260826.1";
import { useCrushJsonEdit } from "./crush-json-edit.js?v=20260826.1";
import { useCrushPresetCrud } from "./crush-preset-crud.js?v=20260826.1";

export function useCrushRunnerPanelController({ api, params, containerApi }) {
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
      // w9y always installs the crush binary at ${WANIX}/crush, so mirror
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
  };
  const launchCrush = (event) => {
    if (event) event.preventDefault();
    openCrushInNewPanel({ source: "launch" });
  };

  const jsonEdit = useCrushJsonEdit({
    draft,
    setDraft,
    activePreset,
    crushrcContent,
    setCrushrcContent,
    setStatus,
  });

  const presetCrud = useCrushPresetCrud({
    activePreset,
    draft,
    setDraft,
    crushrcContent,
    setCrushrcContent,
    setPresets,
    setSavedMarker,
    setStatus,
    switchToPreset,
    programAutoManagedRef,
    updateField,
    params,
  });

  return {
    api,
    params,
    containerApi,
    dockApi,
    presets,
    setPresets,
    activePreset,
    draft,
    setDraft,
    status,
    setStatus,
    savedMarker,
    setSavedMarker,
    crushInstalled,
    setCrushInstalled,
    installing,
    setInstalling,
    detectSource,
    setDetectSource,
    installBannerDismissed,
    setInstallBannerDismissed,
    programAutoManagedRef,
    applyDetectedProgram,
    crushrcContent,
    setCrushrcContent,
    crushrcDirty,
    activeTab,
    setActiveTab,
    formExpanded,
    setFormExpanded,
    switchToPreset,
    updateField,
    handleInstall,
    isDirty,
    commandPreview,
    envLines,
    profileDirty,
    envDirty,
    configDirty,
    openCrushInNewPanel,
    launchCrush,
    ...jsonEdit,
    ...presetCrud,
  };
}
