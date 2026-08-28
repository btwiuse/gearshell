// Dockview panel snapshot store: which panels are open, which is active,
// and the active dockview api (500-line rule split).

import {
  loadActiveWorkspace,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.46";
import { clone } from "./app-normalize.js?v=20260828.47";
import { STARTUP_PANEL_TYPES } from "./app-constants.js?v=20260828.19";

export const openPanelSnapshots = new Map();
export let dockviewApi = null;
// Read-only accessor for sub-modules that need the latest dockview root
// (e.g. home.js, which spawns new panels from the marketing CTAs).
export function getDockviewApi() {
  return dockviewApi;
}

export function persistOpenPanels() {
  const workspace = loadActiveWorkspace();
  workspace.ui = {
    ...workspace.ui,
    openPanels: [...openPanelSnapshots.values()].map(clone),
  };
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
}

export function rememberOpenPanel(panel, snapshot) {
  openPanelSnapshots.set(panel.id, snapshot);
  persistOpenPanels();
}

export function forgetOpenPanel(panelId) {
  if (!openPanelSnapshots.delete(panelId)) return;
  persistOpenPanels();
}

export function getSavedOpenPanels() {
  const panels = loadActiveWorkspace().ui?.openPanels;
  if (!Array.isArray(panels)) return [];
  return panels.filter((panel) =>
    panel && typeof panel === "object" &&
    (STARTUP_PANEL_TYPES.includes(panel.component) ||
      panel.component === "fallback" || panel.component === "task")
  );
}

// Extract the numeric suffix from a CrushRunner panel id ("crush-runner-3"
// → 3). Used by restoreSavedPanels to feed the original id back into
// addCrushRunnerPanel so reloads keep the same numeric label on the
// Crush Runner tab. Returns undefined for legacy snapshots that did
// not record the panel id.
export function parseCrushRunnerPanelId(panelId) {
  if (typeof panelId !== "string") return undefined;
  const match = /^crush-runner-(\d+)$/.exec(panelId);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function setDockviewApi(api) {
  dockviewApi = api;
}
