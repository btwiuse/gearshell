// Crush Runner dependency-injection registry.
//
// The crush-runner panel module family (crush-presets.js, crush-config.js,
// crush-install.js, crush-panel*.js) all read their app.js-provided
// dependencies through crushRunnerDep(name). app.js calls initCrushRunner
// with the full dependency object during boot; every other module must not
// be used before that wiring happens.
//
// This split is part of the 500-line rule: keeping the registry here lets
// the rest of the crush-runner modules stay small and focused.

let __crushRunnerDeps = null;
export function initCrushRunner(dependencies) {
  __crushRunnerDeps = dependencies;
}

let crushRunnerIdCounter = 0;

// Push the module-level counter past `maxId` so subsequent
// addCrushRunnerPanel calls mint fresh ids above any previously
// allocated ones. Used by restoreSavedPanels so newly opened panels
// after a reload never collide with restored ids, even when the saved
// snapshot predates the panelId field (legacy snapshots stored no
// panel id at all and would otherwise leave the counter at 0).
export function reserveCrushRunnerIds(maxId) {
  if (Number.isFinite(Number(maxId)) && Number(maxId) > crushRunnerIdCounter) {
    crushRunnerIdCounter = Number(maxId);
  }
}

// Bump the id counter past `id` after a restored or fresh panel allocates
// it, so the next "new panel" action never collides.
export function adoptCrushRunnerId(id) {
  if (Number.isFinite(id) && id > crushRunnerIdCounter) {
    crushRunnerIdCounter = id;
  }
}

export function nextCrushRunnerId() {
  return ++crushRunnerIdCounter;
}

export function crushRunnerDep(name) {
  if (__crushRunnerDeps == null) {
    throw new Error(
      "crush-runner: initCrushRunner() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __crushRunnerDeps[name];
  if (value === undefined) {
    throw new Error(`crush-runner: missing dependency ${name}`);
  }
  return value;
}

export function __getWanixSystem() {
  return document.getElementById("wanix-system");
}

// Per-panel launch counter so each panel's launches index sequentially
// off the panel id (panel #2 produces 2-1, 2-2, ...). Keeping the
// association explicit makes the running Crush instance's config dir
// visually traceable to the panel that spawned it.
export const perPanelLaunchCount = Object.create(null);
