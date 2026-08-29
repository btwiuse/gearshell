// workbench-plugin.js — the Workbench panel as a plugin.
//
// WorkbenchPanel lives in panels.js (next to the terminal / vm panel
// components) and keeps its custom opener: addWorkbenchPanel enforces
// single-instance semantics (re-activate the existing panel instead of
// duplicating). The restore path (app-panels addRestoredPanel) still
// calls addWorkbenchPanel directly for saved workbench tabs.

import { addWorkbenchPanel, WorkbenchPanel } from "../../panels.js?v=20260812.113";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "workbench",
      label: "Workbench",
      icon: "Monitor",
      title: "Workbench",
      render: WorkbenchPanel,
      open: addWorkbenchPanel,
    });
  },
};
