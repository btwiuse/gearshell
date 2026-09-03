// Entry for the landing prism scene.
//
// Loaded as an ES module from buildless.html. Boots only when THREE is
// present and the landing stage is active (START_STAGE === "landing").
// Honours __BONSAI_HOLD_LANDING for token gating set by config.js.

import { bootPrismScene } from "./class.js";

// Always expose bootLanding so access.js can fire us after a token.
if (window.App) {
  window.App.bootLanding = bootPrismScene;
}

if (typeof THREE === "undefined") {
  if (typeof window.App.flatMode === "function") {
    window.App.flatMode();
  }
} else if (window.START_STAGE !== "landing") {
  // Skip the prism scene on the loading stage; garden scene handles it.
} else if (window.__BONSAI_HOLD_LANDING) {
  // Wait for access.js to call bootLanding once a token is provided.
} else {
  bootPrismScene();
}
