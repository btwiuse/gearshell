// app-layout.js — dockview layout persistence (tab restore v2).
//
// The old restore path (restoreSavedPanels) re-opened each remembered
// panel through the adders, which appends every panel into the same
// group: a multi-pane arrangement collapsed into one tab bar on reload.
// This module persists the FULL dockview layout — group tree, split
// sizes, active group, per-panel pinned state (SerializedDockview from
// api.toJSON()) — into workspace.ui.dockviewLayout and replays it with
// api.fromJSON on boot. Restored panels carry their saved ids, so the
// React components re-attach their sessions from params exactly as they
// do when added live (TerminalPanel etc. wire everything in their mount
// effect), and pinned tabs survive.
//
// Two things fromJSON cannot know and this module handles:
//   1. id counters reset on reload — reservePanelIds lifts them past the
//      restored ids so the next user-open never collides.
//   2. agent-created task panels are ephemeral by design (never written
//      to workspace.tasks, never remembered) — they must NOT respawn
//      their workers on boot, so they are pruned from the saved layout.
// Popout groups are dropped too: a reload should not reopen OS windows.
//
// Saving is wired in app-shell onReady: debounced on every layout change
// (drag, resize, add, remove) and immediate on pin changes.

import {
  loadActiveWorkspace,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.140";
import {
  openPanelSnapshots,
  parseCrushRunnerPanelId,
  rememberOpenPanel,
} from "./app-panels-store.js?v=20260826.140";
import { clone } from "./app-normalize.js?v=20260828.141";
import { reservePanelIds } from "./app-panel-ids.js?v=20260828.76";
import { reserveCrushRunnerIds } from "./plugin/crush-runner/crush-runner.js?v=20260826.136";

const LAYOUT_SAVE_DELAY = 400;
let layoutSaveTimer = null;
// True while a boot restore is in flight, so the layout-change events
// fromJSON fires cannot schedule a save that would clobber the freshly
// restored state (the saved snapshot is already identical, so this is a
// guard, not a correctness requirement).
let restoringLayout = false;

// --- Snapshot re-registration ---
// The adders call rememberOpenPanel so ui.openPanels tracks what is
// open. fromJSON bypasses the adders, so replay those snapshots here
// from the restored params; otherwise a later save would drop restored
// panels from ui.openPanels and the legacy restore path would lose them.
function panelSnapshotFor(panel) {
  const params = panel.params || {};
  switch (params.panelType || panel.id.replace(/-\d+$/, "")) {
    case "terminal":
      return { component: "terminal", profile: clone(params.profile) };
    case "workbench":
      return { component: "workbench", config: clone(params.config) };
    case "vm":
      return { component: "vm", config: clone(params.config) };
    case "task":
      return {
        component: "task",
        task: clone(params.task),
        workspaceId: params.workspaceId,
      };
    default:
      return { component: params.panelType || panel.id.replace(/-\d+$/, "") };
  }
}

// --- Pruning the serialized layout ---
// Remove panels that must not survive a reload: agent task panels that
// were never persisted (not in openPanelSnapshots). They leave the
// panels record and every reference inside the group tree.
function pruneEphemeralTaskPanels(layout) {
  const remembered = new Set(openPanelSnapshots.keys());
  const removable = Object.entries(layout.panels || {})
    .filter(([id, state]) =>
      state.contentComponent === "task" && !remembered.has(id)
    )
    .map(([id]) => id);
  if (removable.length === 0) return;
  for (const id of removable) delete layout.panels[id];
  pruneTree(layout.grid?.root, new Set(removable));
}

function pruneTree(node, removable) {
  if (!node) return;
  if (node.type === "leaf") {
    const data = node.data;
    if (Array.isArray(data?.views)) {
      data.views = data.views.filter((id) => !removable.has(id));
    }
    if (data && removable.has(data.activeView)) delete data.activeView;
  } else if (node.type === "branch" && Array.isArray(node.data)) {
    for (const child of node.data) pruneTree(child, removable);
  }
}

// --- Save ---
export function saveLayoutSnapshot(api) {
  if (restoringLayout) return;
  const layout = api.toJSON();
  // Never reopen OS popout windows on boot; floating (in-page) groups
  // are kept for full fidelity.
  delete layout.popoutGroups;
  pruneEphemeralTaskPanels(layout);
  const panelIds = Object.keys(layout.panels || {});
  if (panelIds.length === 0) return;
  const workspace = loadActiveWorkspace();
  workspace.ui = { ...workspace.ui, dockviewLayout: layout };
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
}

function scheduleLayoutSave(api) {
  if (restoringLayout) return;
  clearTimeout(layoutSaveTimer);
  layoutSaveTimer = setTimeout(
    () => saveLayoutSnapshot(api),
    LAYOUT_SAVE_DELAY,
  );
}

export function wireLayoutPersistence(api) {
  // Structural changes and sash drags both surface here; the debounce
  // folds a drag gesture into one write.
  api.onDidLayoutChange(() => scheduleLayoutSave(api));
  // Pinned state changes immediately (a pin/unpin toggles the separate
  // pinned row; a lost pin on reload is exactly what this module fixes).
  api.onDidPanelPinnedChange(() => {
    clearTimeout(layoutSaveTimer);
    saveLayoutSnapshot(api);
  });
}

// --- Restore ---
// Replay the saved layout, re-register panel snapshots and lift the id
// counters. Returns true when a layout was actually restored (callers
// then skip startupPanels and autoStartWorkspaceTasks).
export function restoreSavedLayout(api) {
  const layout = loadActiveWorkspace().ui?.dockviewLayout;
  if (!layout || typeof layout !== "object") return false;
  const panelIds = Object.keys(layout.panels || {});
  if (!layout.grid || panelIds.length === 0) return false;
  restoringLayout = true;
  try {
    api.fromJSON(layout);
    reservePanelIds(api.panels);
    // Crush Runner ids come from a separate counter with its own
    // reservation API; lift it past the largest restored id so a later
    // open cannot collide with a restored panel.
    let maxCrushRunnerId = 0;
    for (const panel of api.panels) {
      const parsed = parseCrushRunnerPanelId(panel.id);
      if (Number.isFinite(parsed) && parsed > maxCrushRunnerId) {
        maxCrushRunnerId = parsed;
      }
    }
    if (maxCrushRunnerId > 0) reserveCrushRunnerIds(maxCrushRunnerId);
    for (const panel of api.panels) {
      const snapshot = panelSnapshotFor(panel);
      if (snapshot) rememberOpenPanel(panel, snapshot);
    }
  } finally {
    // Let the layout-change events fromJSON fires settle before saving
    // can be triggered again.
    setTimeout(() => {
      restoringLayout = false;
    }, 0);
  }
  return true;
}
