// settings-plugins.js — the Settings "Plugins" card, registered through
// the plugin kernel's registerSettingsSection.
//
// Round 29 extracted the full plugin manager into its own page
// (plugins-panel.js); this module contributes a compact card to the
// Settings page instead — installed/enabled counts plus a button that
// opens the manager. It registers through the same settings-section
// path third-party plugins use (ctx.registerSettingsSection), so it
// doubles as the built-in dogfood for that API.
//
// The card is DOM-based (the Settings page mounts sections as <details>
// blocks, matching its other sections); the manager page is React.

import {
  PLUGIN_CHANGED_EVENT,
  registerSettingsSection,
} from "./plugins.js?v=20260829.33";
import { WORKSPACE_CHANGED_EVENT } from "./app-constants.js?v=20260828.28";

const BUILTIN_PLUGINS_SECTION = {
  id: "plugins",
  name: "Plugins",
  version: "1.0.0",
  permissions: {
    api: ["panels.open", "config.plugins.list"],
  },
};

function renderPluginsCard(root, ctx) {
  const countEl = document.createElement("span");
  countEl.className = "plugins-card-count";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "plugins-card-open";
  openBtn.textContent = "Open plugins page";
  openBtn.addEventListener("click", () => ctx.api.panels.open("plugins"));

  const refresh = () => {
    try {
      const result = ctx.api.config.plugins.list();
      const plugins = Array.isArray(result) ? result : [];
      const enabled = plugins.filter((plugin) => plugin.enabled).length;
      countEl.textContent = `${plugins.length} installed · ${enabled} enabled`;
      openBtn.disabled = false;
    } catch {
      countEl.textContent = "Plugins";
      openBtn.disabled = false;
    }
  };

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Install, edit and manage the tabs and apps that extend the shell.";

  const footer = document.createElement("div");
  footer.className = "plugins-card-footer";
  footer.append(countEl, openBtn);
  root.append(hint, footer);

  refresh();
  window.addEventListener(PLUGIN_CHANGED_EVENT, refresh);
  window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
  return () => {
    window.removeEventListener(PLUGIN_CHANGED_EVENT, refresh);
    window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
  };
}

// Register once at boot (app.js calls this after initPlugins).
export function registerPluginsSettingsSection() {
  registerSettingsSection(BUILTIN_PLUGINS_SECTION, {
    id: "plugins",
    label: "Plugins",
    render: renderPluginsCard,
  });
}
