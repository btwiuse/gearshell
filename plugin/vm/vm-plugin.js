// vm-plugin.js — the VM panel as a plugin.
//
// The VmPanel component lives with the plugin (vm-panel.js); the custom
// opener addVmPanel stays in the root panels.js because the saved-tab
// restore path (app-panels addRestoredPanel) calls it directly.

import { addVmPanel } from "../../panels.js";
import { VmPanel } from "./vm-panel.js";
// The VM panel's assets live with this plugin (vm-config.js); the host
// re-exports them as deprecated DEFAULT_VM_* aliases so existing config
// normalization keeps resolving. `defaults` documents that ownership
// (the panel's effective runtime config still flows through
// getVmPanelConfig, which reads the same constants).
import { VM_BACKEND_URL, VM_LINUX_URL } from "./vm-config.js";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "vm",
      label: "VM",
      icon: "Cpu",
      title: "VM",
      render: VmPanel,
      open: addVmPanel,
      defaults: { backendUrl: VM_BACKEND_URL, linuxUrl: VM_LINUX_URL },
    });
  },
};
