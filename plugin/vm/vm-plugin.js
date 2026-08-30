// vm-plugin.js — the VM panel as a plugin.
//
// The VmPanel component lives with the plugin (vm-panel.js); the custom
// opener addVmPanel stays in the root panels.js because the saved-tab
// restore path (app-panels addRestoredPanel) calls it directly.

import { addVmPanel } from "../../panels.js?v=20260812.153";
import { VmPanel } from "./vm-panel.js?v=20260830.38";

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
