// Settings panel module facade (500-line rule split). Re-exports the
// public surface app.js imports.
export { initSettings, settingsDep } from "./settings-deps.js";
export {
  addSettingsPanel,
  SettingsPanel,
} from "./settings-panel.js";
export { TerminalPresetIconPicker } from "./settings-icons.js";
