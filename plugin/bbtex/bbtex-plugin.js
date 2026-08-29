// bbtex-plugin.js — Bubble Tea playground (dogfood for terminal.embed +
// the plugin-declared wasm bind path).
//
// The bbtex manifest (https://w9y.io/manifest/bbtex@v2.0.12/) maps 63
// Bubble Tea v2 examples to on-demand-built js/wasm binaries. This plugin
// declares every one of them as a wasm dependency (each mounted into every
// task namespace at bin/<example>, fetched lazily on first run) plus the
// artichoke.md preset the pager example reads, and shows a playground
// panel: click an example, and an embedded terminal starts it as its own
// task (profile.cmd = example id; pager starts with wd=/preset).

import { BbtexPlayground } from "./bbtex.js?v=20260830.9";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "bbtex",
      label: "Bubble Tea Playground",
      icon: "Sprout",
      title: "Bubble Tea Playground",
      render: BbtexPlayground,
    });
  },
};
