// Settings panel module facade (500-line rule split). Re-exports the
// public surface app.js imports.
export { initSettings, settingsDep } from "./settings-deps.js?v=20260826.2";
export {
  addSettingsPanel,
  SettingsPanel,
} from "./settings-panel.js?v=20260826.59";
export { TerminalPresetIconPicker } from "./settings-icons.js?v=20260826.3";
