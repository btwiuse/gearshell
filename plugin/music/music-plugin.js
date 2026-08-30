// music-plugin.js — Music as a dogfood plugin (WISHLIST #9, slice 1).
//
// The shell's own launcher/panel registries no longer hardcode Music;
// this entry module is loaded through the plugin kernel
// (config.plugins -> DEFAULT_PLUGINS) and re-registers the Music panel
// exactly like a third-party plugin would: same-origin URL entry,
// `register(ctx)` contract, registerPanel({ component, label, icon,
// title, render }). The panel component and engine live in the normal
// module graph (music.js + music-*), so this file is deliberately tiny.
//
// Entry module for the Music plugin: modules are unversioned (cache-bust
// tokens were retired), so keep the manifest entry stable for consumers.

import { MusicPanel } from "./music.js";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "music",
      label: "Music",
      icon: "Music2",
      title: "Music",
      render: MusicPanel,
    });
  },
};
