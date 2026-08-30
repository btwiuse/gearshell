// bbtex-plugin.js — Bubble Tea playground (dogfood for terminal.embed +
// the dual-mode w9y dependency path).
//
// The bbtex manifest (https://w9y.io/manifest/bbtex@v2.0.12/) maps 63
// Bubble Tea v2 examples to on-demand-built js/wasm binaries. The plugin
// declares the package as a w9y mod dependency (w9y: { mod: "bbtex",
// version: "v2.0.12" }) so the shell installs it via `w9y mod apply` into
// /opfs/wanix/examples/<id>; the playground panel embeds one terminal per
// open example with profile.cmd = /opfs/wanix/examples/<id> (pager starts
// with wd=/preset where the artichoke.md preset lands).

import { BbtexPlayground } from "./bbtex.js";

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
