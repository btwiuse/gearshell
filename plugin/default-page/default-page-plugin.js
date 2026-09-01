// default-page-plugin.js — the minimal empty-workspace landing.
//
// Lives as a separate plugin (instead of folding into launcher.js) so
// users who disable the launcher panel still have *something* when
// they close every tab: a tiny card that says "press the hotkey"
// plus a couple of high-frequency quick launches. The launcher
// panel, when re-enabled, takes over this role automatically because
// both register as emptyGrid providers and the first enabled one
// wins.

import { DefaultPage } from "./default-page.js";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "default-page",
      label: "Default Page",
      icon: "Home",
      title: "Default Page",
      render: DefaultPage,
      emptyGrid: true,
    });
  },
};