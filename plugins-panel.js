// plugins-panel.js — dockview shell for the standalone Plugins page.
//
// The Plugins manager is a first-class panel (like Playground) so the
// Settings page stays focused on shell configuration: the launcher,
// panels.open("plugins"), and the Settings Plugins card all land here.
// The page itself lives in plugins-page.js (cards + modal split out).

import React from "react";
import { nextPanelIndex } from "./app-panel-ids.js?v=20260828.76";
import { PluginsPage } from "./plugins-page.js?v=20260829.71";

let __pluginsPanelDeps = null;
export function initPluginsPanel(dependencies) {
  __pluginsPanelDeps = dependencies;
}
function pluginsPanelDep(name) {
  if (__pluginsPanelDeps == null) {
    throw new Error(
      "plugins-panel: initPluginsPanel() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __pluginsPanelDeps[name];
  if (value === undefined) {
    throw new Error(`plugins-panel: missing dependency ${name}`);
  }
  return value;
}

export function PluginsPanel() {
  return React.createElement(
    "div",
    { className: "plugins-panel panel-content" },
    React.createElement(PluginsPage, null),
  );
}

// === Panel registration ===

export function addPluginsPanel(api, group) {
  const id = nextPanelIndex("plugins");
  const panel = api.addPanel({
    id: `plugins-${id}`,
    component: "plugins",
    params: { pluginsId: id, panelType: "plugins" },
    title: "Plugins",
    ...(group && { position: { referenceGroup: group } }),
  });
  pluginsPanelDep("rememberOpenPanel")(panel, { component: "plugins" });
  panel.api.setActive();
  return panel;
}
