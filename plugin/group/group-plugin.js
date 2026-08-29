// group-plugin.js — the Group (About) panel as a plugin.
//
// GroupPanel is a static image panel with no dependencies, so it was the
// last kernel-registered panel that did not need the kernel: it now
// loads through the plugin kernel like Music / Deck. Disabling the group
// plugin in Settings hides the panel type from the launcher.

import { GroupPanel } from "../../panels.js?v=20260812.94";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "group",
      label: "Group",
      icon: "UsersRound",
      title: "Group",
      render: GroupPanel,
    });
  },
};
