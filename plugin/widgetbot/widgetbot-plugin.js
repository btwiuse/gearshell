// widgetbot-plugin.js — the Discord community widget as a plugin.
//
// Registers the WidgetBot crate as a shell overlay: the plugin manifest
// gates availability (disable it in the Plugins page to unload), while
// the shell config `widgetbot` flag still gates visibility so the
// existing Settings toggle keeps working.

import { WidgetBotOverlay } from "./widgetbot.js?v=20260829.7";

export const plugin = {
  register(ctx) {
    ctx.registerOverlay({
      id: "widgetbot",
      render: WidgetBotOverlay,
    });
  },
};
