// PrismScene — the main class for the landing prism scene.
//
// Methods are composed from three mixin modules by topic:
//   - init.js         (constructor and init* family)
//   - trace-methods.js (trace, castRay, sheet writers)
//   - update.js       (per-column and per-frame updates)
//   - frame.js        (drag, resize, animate)

import { N_COL } from "./optics.js";
import { PrismInitMethods } from "./init.js";
import { PrismTraceMethods } from "./trace-methods.js";
import { PrismUpdateMethods } from "./update.js";
import { PrismFrameMethods } from "./frame.js";

export class PrismScene {
  constructor() {
    this.N_COL = N_COL;
    this.initRenderer();
    this.initPrismGeometry();
    this.initGlassAndEdges();
    this.initBeams();
    this.initSheets();
    this.initTraceState();
    this.initSprites();
    this.initPulses();
    this.initInteractionState();
    this.wireInteraction();
    this.wireResize();
    this.initOpticsState();
    this.initTiming();
    this.startLoop();
    // Expose a dispose hook so the loader can tear down on stage transition.
    window.App._disposeLanding = () => {
      try {
        this.renderer.dispose();
      } catch {}
    };
  }
}

// Compose method groups onto the prototype (single allocation per group).
Object.assign(PrismScene.prototype, PrismInitMethods);
Object.assign(PrismScene.prototype, PrismTraceMethods);
Object.assign(PrismScene.prototype, PrismUpdateMethods);
Object.assign(PrismScene.prototype, PrismFrameMethods);

// Convenience boot entry used by `index.js`.
export function bootPrismScene() {
  if (window.App._landingBooted) return;
  window.App._landingBooted = true;
  try {
    new PrismScene();
  } catch (err) {
    console.error(err);
  }
}
