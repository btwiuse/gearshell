// settings-plugin.js — the Settings panel as a plugin.
//
// SettingsPanel reads its helpers through the initSettings dependency
// shim (wired from app.js), and addSettingsPanel is the generic
// opener shape, so the generic plugin opener is fully equivalent.
// Disabling the settings plugin in the Plugins page hides the panel
// type from the launcher (plugin settings sections still register,
// they just have no panel to mount in until it is re-enabled).

import { SettingsPanel } from "./settings.js?v=20260826.72";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "settings",
      label: "Settings",
      icon: "Settings",
      title: "Settings",
      render: SettingsPanel,
    });
  },
};
