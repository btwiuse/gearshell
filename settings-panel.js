// Settings panel component: renders the inline template and mounts the
// per-section setup functions. Public entry for app.js (SettingsPanel,
// addSettingsPanel).

import React, { useEffect, useRef } from "react";
import { settingsDep } from "./settings-deps.js?v=20260826.2";
import { SETTINGS_TEMPLATE_HTML } from "./settings-template.js?v=20260826.10";
import { setupConfigForm } from "./settings-config.js?v=20260826.10";
import { setupTerminalProfileForm } from "./settings-terminal-editor.js?v=20260826.3";
import { setupWorkspaceForm } from "./settings-workspace.js?v=20260826.2";
import { setupPresetLibrary } from "./settings-preset-library.js?v=20260826.2";
import { setupSystemForm } from "./settings-system.js?v=20260826.2";
import { setupBindForm } from "./settings-binds.js?v=20260826.2";
import { setupTaskForm } from "./settings-task.js?v=20260826.2";
export function SettingsPanel({ containerApi }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.innerHTML = SETTINGS_TEMPLATE_HTML;
    const settingsContent = wrapper.firstElementChild;
    if (!settingsContent) return;

    const disposeConfigForm = setupConfigForm(settingsContent);
    const disposeTerminalProfileForm = setupTerminalProfileForm(
      settingsContent,
    );
    const disposeWorkspaceForm = setupWorkspaceForm(settingsContent);
    const disposePresetLibrary = setupPresetLibrary(settingsContent);
    const disposeSystemForm = setupSystemForm(settingsContent);
    const disposeBindForm = setupBindForm(settingsContent);
    const disposeTaskForm = setupTaskForm(settingsContent, containerApi);
    return () => {
      disposeConfigForm?.();
      disposeTerminalProfileForm?.();
      disposeWorkspaceForm?.();
      disposePresetLibrary?.();
      disposeSystemForm?.();
      disposeBindForm?.();
      disposeTaskForm?.();
      if (wrapper.firstElementChild) wrapper.innerHTML = "";
    };
  }, [containerApi]);

  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// so it survives React re-renders but resets on page reload.
export let settingsIdCounter = 0;

// Register a new Settings panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Settings from the panel
// menu, and from the restore-saved-panels path on boot.
export function addSettingsPanel(api, group) {
  const id = ++settingsIdCounter;
  const panel = api.addPanel({
    id: `settings-${id}`,
    component: "settings",
    params: { settingsId: id, panelType: "settings" },
    title: "Settings",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = settingsDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "settings" });
  panel.api.setActive();
  return panel;
}
