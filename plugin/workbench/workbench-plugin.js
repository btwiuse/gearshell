// workbench-plugin.js — the Workbench panel as a plugin.
//
// The WorkbenchPanel component lives with the plugin
// (workbench-panel.js); the custom opener addWorkbenchPanel (with its
// single-instance semantics) stays in the root panels.js because the
// saved-tab restore path (app-panels addRestoredPanel) calls it
// directly.

import { addWorkbenchPanel } from "../../panels.js?v=20260812.129";
import { WorkbenchPanel } from "./workbench-panel.js?v=20260830.14";

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
