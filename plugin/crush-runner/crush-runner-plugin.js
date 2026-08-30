// crush-runner-plugin.js — the Crush Runner panel as a plugin.
//
// CrushRunnerPanel keeps its custom opener: addCrushRunnerPanel mints
// ids through the reserved counter (nextCrushRunnerId) so restored
// panels keep their numeric label and linked terminal launch ids
// across reloads. initCrushRunner and the agents API stay kernel; the
// launcher's "Crush" row is a separate iframe plugin and is unaffected
// when this panel plugin is disabled.

import {
  addCrushRunnerPanel,
  CrushRunnerPanel,
} from "./crush-runner.js";

export const plugin = {
  register(ctx) {
    ctx.registerPanel({
      component: "crush-runner",
      label: "Crush Runner",
      icon: "Rocket",
      title: "Crush Runner",
      render: CrushRunnerPanel,
      open: addCrushRunnerPanel,
    });
  },
};
