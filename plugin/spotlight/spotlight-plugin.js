// spotlight-plugin.js — the Spotlight launcher as a plugin.
//
// Registers an OVERLAY (not a panel) whose surface is a React component
// rendered directly into the shell DOM (no iframe, no postMessage
// roundtrip — every keystroke talks to ctx.api synchronously). The
// hotkey table is normalized+owned per plugin, so disabling this plugin
// unregisters the key with it.
//
// This coexists with the launcher panel plugin on purpose: the launcher
// card is still the empty-workspace fallback (the shell reopens it
// whenever the grid empties), while Spotlight is the transient,
// keyboard-first way to launch something without spending a tab on it.

import {
  SPOTLIGHT_OVERLAY_ID,
  SpotlightOverlay,
} from "./spotlight-overlay.js";

export const plugin = {
  register(ctx) {
    ctx.registerOverlay({
      id: SPOTLIGHT_OVERLAY_ID,
      render: SpotlightOverlay,
      // Pass ctx.api down to the overlay so it can call panels.open
      // / panels.focus / config.* with the same scoped proxy the
      // in-page component plugins use (permissions.api on the
      // manifest is the whitelist). The overlay never reaches for
      // window.GearShell directly.
      props: { api: ctx.api },
    });
    // ctrl+shift+/: the shell's hotkey table is normalized+owned per
    // plugin, so disabling this plugin unregisters the key with it.
    // (cmd+space is swallowed by macOS itself, hence ctrl+shift+/ as
    // the default.)
    ctx.registerHotkey({
      id: "spotlight:toggle",
      key: "ctrl+shift+/",
      action: { method: "overlay.toggle", args: [SPOTLIGHT_OVERLAY_ID] },
    });
  },
};