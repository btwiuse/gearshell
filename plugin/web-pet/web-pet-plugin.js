// web-pet-plugin.js — the Wagi Dog desktop pet as a plugin.
//
// Registers WagiDogPet as a shell overlay: the plugin manifest gates
// availability (disable it in the Plugins page to unload), while the
// shell config `wagiDogEnabled` flag still gates visibility so the
// launcher menu / Settings toggles keep working.

import { WagiDogPet } from "../../panels.js?v=20260812.97";

export const plugin = {
  register(ctx) {
    ctx.registerOverlay({
      id: "web-pet",
      render: WagiDogPet,
    });
  },
};
