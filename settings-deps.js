// Settings dependency-injection registry. Every settings-*.js module
// reads app.js-provided deps through settingsDep; initSettings wires them
// during boot (500-line rule split).

let __settingsDeps = null;
export function initSettings(dependencies) {
  __settingsDeps = dependencies;
}
export function settingsDep(name) {
  if (__settingsDeps == null) {
    throw new Error('settings: initSettings() has not been called; ensure app.js wires it in.');
  }
  const value = __settingsDeps[name];
  if (value === undefined) {
    throw new Error('settings: missing dependency ' + name);
  }
  return value;
}
