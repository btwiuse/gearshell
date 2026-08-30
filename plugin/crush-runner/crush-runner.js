// Crush Runner panel module facade.
//
// The Crush Runner feature was split into small modules under the
// 500-line rule; this file only re-exports the public surface app.js
// imports so its `import { ... } from "./crush-runner.js"` line stays
// stable:
//
//   crush-deps.js           dependency registry + panel id counters
//   crush-presets.js        default profile, default crushrc, built-ins
//   crush-config.js         config dirs + launch profile + task helpers
//   crush-install.js        `which crush` detect + `w9y mod apply` install
//   crush-json-edit.js      JSON tab editor state
//   crush-preset-crud.js    save / save-as / delete / reset handlers
//   crush-panel-controller.js  panel state + install/launch/dirty logic
//   crush-panel-config.js   configuration section JSX (tabs + editors)
//   crush-panel.js          the panel component + addCrushRunnerPanel

export {
  initCrushRunner,
  reserveCrushRunnerIds,
} from "./crush-deps.js";
export {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  getBuiltinCrushRunnerPresets,
} from "./crush-presets.js";
export {
  addCrushRunnerPanel,
  CrushRunnerPanel,
} from "./crush-panel.js";
