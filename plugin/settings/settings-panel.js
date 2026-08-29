// Settings panel component: renders the inline template and mounts the
// per-section setup functions. Public entry for app.js (SettingsPanel,
// addSettingsPanel).

import React, { useEffect, useRef } from "react";
import { settingsDep } from "./settings-deps.js?v=20260826.3";
import { nextPanelIndex } from "../../app-panel-ids.js?v=20260828.76";
import { SETTINGS_TEMPLATE_HTML } from "./settings-template.js?v=20260826.16";
import { setupConfigForm } from "./settings-config.js?v=20260826.12";
import { setupTerminalProfileForm } from "./settings-terminal-editor.js?v=20260826.5";
import { setupWorkspaceForm } from "./settings-workspace.js?v=20260826.3";
import { setupPresetLibrary } from "./settings-preset-library.js?v=20260826.3";
import { setupSystemForm } from "./settings-system.js?v=20260826.3";
import { setupBindForm } from "./settings-binds.js?v=20260826.3";
import { setupTaskForm } from "./settings-task.js?v=20260826.3";
import { setupAgentActivity } from "./settings-agent-activity.js?v=20260829.100";
import { listSettingsSections } from "../../plugins.js?v=20260829.88";

// Mount plugin-registered settings sections (ctx.registerSettingsSection)
// after the built-in template content. Each section gets a <details>
// shell matching the built-in sections; render(root, ctx) returns a
// dispose function.
function mountSettingsSections(settingsContent) {
  const sections = listSettingsSections();
  if (sections.length === 0) return null;
  const disposes = [];
  const details = document.createElement("details");
  details.className = "settings-section";
  details.open = true;
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = sections.map((section) => section.label).join(" · ");
  summary.append(label);
  const body = document.createElement("div");
  body.className = "body";
  details.append(summary, body);
  settingsContent.append(details);
  for (const section of sections) {
    const dispose = section.render(body, section.ctx);
    if (typeof dispose === "function") disposes.push(dispose);
  }
  return () => {
    for (const dispose of disposes) dispose();
  };
}

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
    const disposeAgentActivity = setupAgentActivity(settingsContent);
    const disposeSections = mountSettingsSections(settingsContent);
    return () => {
      disposeConfigForm?.();
      disposeTerminalProfileForm?.();
      disposeWorkspaceForm?.();
      disposePresetLibrary?.();
      disposeSystemForm?.();
      disposeBindForm?.();
      disposeAgentActivity?.();
      disposeSections?.();
      disposeTaskForm?.();
      if (wrapper.firstElementChild) wrapper.innerHTML = "";
    };
  }, [containerApi]);

  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// Register a new Settings panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Settings from the panel
// menu, and from the restore-saved-panels path on boot.
export function addSettingsPanel(api, group) {
  const id = nextPanelIndex("settings");
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
