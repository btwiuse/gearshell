// deck-plugin.js — the Deck (marketing slides) panel as a plugin.
//
// Registration-only pluginization: the deck module keeps its dep shim
// (initDeck is still called by app.js — DeckPanel needs the Reveal /
// marked CDN globals and the debug-overlay helpers), but the panel type
// itself is now registered through the plugin kernel like any third-
// party component plugin. Disabling the deck plugin in Settings hides
// the panel type from the launcher and restores without touching a line
// of deck.js.

import { DeckPanel } from "./deck.js?v=20260812.38";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "deck",
      label: "Deck",
      icon: "LayoutDashboard",
      title: "Deck",
      render: DeckPanel,
    });
  },
};
