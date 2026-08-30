// playground-plugin.js — the GearShell API Playground panel as a plugin.
//
// PlaygroundPanel is a leaf panel: it exercises window.GearShell
// directly through its tab views and needs no kernel state of its own,
// so it loads through the plugin kernel like Music / Deck / Group.
// Disabling the playground plugin in the Plugins page hides the panel
// type from the launcher.

import { PlaygroundPanel } from "./playground-panel.js?v=20260829.130";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "playground",
      label: "Playground",
      icon: "SlidersHorizontal",
      title: "Playground",
      render: PlaygroundPanel,
    });
  },
};
