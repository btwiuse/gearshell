// GardenScene — the main class for the loading-stage bonsai garden.
//
// Methods are composed from two mixin modules by topic:
//   - init.js   (init* family + start)
//   - update.js (per-frame update family + animate)

import { GardenInitMethods } from "./init.js";
import { GardenUpdateMethods } from "./update.js";

export class GardenScene {
  constructor() {
    // Order matches the original constructor body in garden-scene.js.
    this.init();
  }
}

// Compose method groups onto the prototype (single allocation per group).
Object.assign(GardenScene.prototype, GardenInitMethods);
Object.assign(GardenScene.prototype, GardenUpdateMethods);
