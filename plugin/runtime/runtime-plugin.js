// runtime-plugin.js — the Runtime diagnostics panel as a plugin.
//
// RuntimePanel is a leaf panel: it renders wanix state read through the
// initRuntime dependency shim (still wired from app.js) and nothing
// else, so it loads through the plugin kernel like Music / Deck /
// Group. Disabling the runtime plugin in the Plugins page hides the
// panel type from the launcher.

import { RuntimePanel } from "./runtime.js?v=20260826.51";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "runtime",
      label: "Runtime",
      icon: "Activity",
      title: "Runtime",
      render: RuntimePanel,
    });
  },
};
