// group-plugin.js — the Group (About) panel as a plugin.
//
// GroupPanel is a static image panel with no dependencies; the component
// lives with the plugin (group-panel.js). Disabling the group plugin in
// Settings hides the panel type from the launcher.

import { GroupPanel } from "./group-panel.js?v=20260830.3";

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
