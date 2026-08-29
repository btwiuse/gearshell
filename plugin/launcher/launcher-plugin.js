// launcher-plugin.js — the built-in Launcher panel as a plugin.
//
// This is the default launcher implementation. The kernel's empty-grid
// guards open the "launcher" component through the plugin path, so the
// launcher is swappable: disable this plugin and enable any other
// plugin that registers component "launcher" (registerPanel throws on
// a duplicate, so only one launcher can be active at a time).

import { addFallbackPanel, FallbackPanel } from "./launcher.js?v=20260812.47";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "launcher",
      label: "Launcher",
      icon: "Rocket",
      title: "Launcher",
      render: FallbackPanel,
      open: addFallbackPanel,
    });
  },
};
