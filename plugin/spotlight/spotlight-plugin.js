// spotlight-plugin.js — the Spotlight launcher as a plugin.
//
// Registers an OVERLAY (not a panel) whose surface is an iframe page, plus
// the hotkey that toggles it. The `iframe: { src }` field on the overlay
// registration is what lets the page reach the shell: the postMessage
// bridge whitelists senders by matching the <iframe> element's src
// against registered plugin iframes, and an overlay-hosted iframe is not
// a panel, so it declares its src here to join that whitelist.
//
// This coexists with the launcher panel plugin on purpose: the launcher
// card is still the empty-workspace fallback (the shell reopens it
// whenever the grid empties), while Spotlight is the transient, keyboard
// -first way to launch something without spending a tab on it.

import {
  SPOTLIGHT_OVERLAY_ID,
  SPOTLIGHT_SRC,
  SpotlightOverlay,
} from "./spotlight-overlay.js";

export const plugin = {
  register(ctx) {
    ctx.registerOverlay({
      id: SPOTLIGHT_OVERLAY_ID,
      render: SpotlightOverlay,
      iframe: { src: SPOTLIGHT_SRC },
    });
    // ctrl+space: the shell's hotkey table is normalized+owned per plugin,
    // so disabling this plugin unregisters the key with it. (cmd+space is
    // swallowed by macOS itself, hence ctrl+space as the default.)
    ctx.registerHotkey({
      id: "spotlight:toggle",
      key: "ctrl+shift+/",
      action: { method: "overlay.toggle", args: [SPOTLIGHT_OVERLAY_ID] },
    });
  },
};
