// home-plugin.js — the Home (Landing) panel as a plugin.
//
// LandingPanel still reads its helpers through the initHome dependency
// shim (wired from app.js), and the kernel keeps addLandingPanel as the
// addPanelByComponent catch-all for unknown components, so this plugin
// only moves the home panel TYPE registration out of the kernel —
// exactly like the runtime / playground plugins.

import { LandingPanel } from "./home.js?v=20260812.32";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "home",
      label: "Home",
      icon: "House",
      title: "Home",
      render: LandingPanel,
    });
  },
};