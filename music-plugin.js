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
// Version discipline: the manifest entry URL carries its own ?v= token
// (bumped manually alongside music.js edits — the version cascade only
// rewrites import statements, not config data).

import { MusicPanel } from "./music.js?v=20260829.13";

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
