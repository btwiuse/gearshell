// w9y-plugin.js — Packages (w9y) management panel.
//
// A built-in (required) plugin panel over the w9y install registry:
// list installed mods, install/remove/re-apply, and compare the
// installed version against the version plugin manifests declare via
// their w9y dependency. All data flows through window.GearShell.w9y.*
// (the thin orchestration layer in app-w9y-registry.js) and the
// w9y.changed events it emits — the w9y CLI owns the registry file.

import { W9yPackages } from "./w9y.js";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "w9y",
      label: "Packages",
      icon: "Boxes",
      title: "Packages (w9y)",
      render: W9yPackages,
    });
  },
};
