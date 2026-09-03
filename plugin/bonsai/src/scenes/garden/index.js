// Entry for the bonsai garden scene.
//
// Loaded as an ES module from buildless.html. Always constructs the scene
// when THREE is present (the renderer either fails and falls back to
// flatMode, or succeeds and is wired into App.startGarden).

import { GardenScene } from "./class.js";

if (typeof THREE !== "undefined") {
  const garden = new GardenScene();
  if (garden.ready) {
    window.App.startGarden = () => garden.start();
  }
  if (window.START_STAGE === "loading") {
    document.body.classList.remove("stage-landing");
    document.body.classList.add("stage-loading", "ready");
    if (window.App.startGarden) window.App.startGarden();
    if (window.FREEZE === null && window.QS.has("demo")) {
      setTimeout(() => {
        if (!window.state.external) window.simulate();
      }, 700);
    }
  }
}
