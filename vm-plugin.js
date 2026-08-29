// vm-plugin.js — the VM panel as a plugin.
//
// VmPanel lives in panels.js next to the terminal / workbench panels
// and keeps its custom opener: addVmPanel clones the panel config for
// the session params and remembers the panel for layout persistence.
// The restore path (app-panels addRestoredPanel) still calls
// addVmPanel directly for saved VM tabs.

import { addVmPanel, VmPanel } from "./panels.js?v=20260812.82";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "vm",
      label: "VM",
      icon: "Cpu",
      title: "VM",
      render: VmPanel,
      open: addVmPanel,
    });
  },
};
