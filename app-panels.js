// Panel creation catalog + saved-panel restore (500-line rule split).

import { systemReady, wanixSystem } from "./app-state.js";
import {
  loadActiveWorkspace,
  loadWorkspace,
} from "./app-workspace.js";
import {
  getDefaultTerminalProfile,
  getWorkbenchPanelConfig,
} from "./app-terminal-profiles.js";
import {
  getSavedOpenPanels,
  parseCrushRunnerPanelId,
} from "./app-panels-store.js";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addWorkbenchPanel as addWorkbenchPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
} from "./panels.js";
import {
  Puzzle,
  Terminal,
} from "lucide-react";

export function blankTerminalPresetDraft() {
  return {
    name: "",
    icon: "terminal",
    program: "",
    args: "",
    type: "gojs",
    wd: "",
    env: "",
  };
}

export let homeIdCounter = 0;
export let groupIdCounter = 0;
export let iframeIdCounter = 0;
export let settingsIdCounter = 0;
export let filesIdCounter = 0;
export let runtimeIdCounter = 0;
export let workbenchIdCounter = 0;
export let vmIdCounter = 0;
export let workspaceTaskPanelCounter = 0;
export let fallbackIdCounter = 0;

export function autoStartWorkspaceTasks(api) {
  const workspace = loadActiveWorkspace();
  for (const task of workspace.tasks) {
    if (task.autoStart) addWorkspaceTaskPanelFromPanels(api, task, workspace);
  }
}

export const PANEL_CREATION_OPTIONS = [
  { component: "terminal", label: "Terminal", icon: Terminal },
  { component: "plugins", label: "Plugins", icon: Puzzle },
];

function addRestoredPanel(api, panel) {
  if (panel.component === "terminal") {
    addTerminalPanelFromPanels(
      api,
      undefined,
      panel.profile || getDefaultTerminalProfile(),
    );
  } else if (panel.component === "workbench") {
    addWorkbenchPanelFromPanels(
      api,
      undefined,
      panel.config || getWorkbenchPanelConfig(),
    );
  } else if (panel.component === "task" && panel.task) {
    addWorkspaceTaskPanelFromPanels(
      api,
      panel.task,
      loadWorkspace(panel.workspaceId) || loadActiveWorkspace(),
    );
  } else if (panel.component === "crush-runner") {
    // Legacy: old workspaces stored crush-runner panels before the
    // iframe edition replaced them. Routing them through
    // addPanelByComponentFromPanels gracefully falls through to the
    // "component not registered" path, so the user just sees the
    // panel missing rather than the workspace failing to restore.
    addPanelByComponentFromPanels(api, panel.component, undefined, {
      id: parseCrushRunnerPanelId(panel.panelId),
    });
  } else {
    addPanelByComponentFromPanels(api, panel.component);
  }
}

function reactivateSavedPanel(api) {
  // Each add* helper above calls setActive() on the newly added panel, so the
  // last-added panel ends up active. When we remembered which panel was active
  // before refresh, reactivate that one here so the user lands back where they
  // were rather than on the rightmost tab.
  const savedActiveIndex = loadActiveWorkspace().ui?.activeOpenPanelIndex;
  if (
    typeof savedActiveIndex === "number" &&
    savedActiveIndex >= 0 &&
    savedActiveIndex < api.panels.length
  ) {
    api.panels[savedActiveIndex]?.api.setActive();
  }
}

export function restoreSavedPanels(api) {
  const panels = getSavedOpenPanels();
  for (const panel of panels) {
    addRestoredPanel(api, panel);
  }
  reactivateSavedPanel(api);
  return panels.length > 0;
}

export function whenWanixReady(callback) {
  const run = () => requestAnimationFrame(callback);
  if (systemReady) {
    run();
    return;
  }

  const onReady = (event) => {
    if (event.target !== wanixSystem) return;
    wanixSystem.removeEventListener("ready", onReady);
    run();
  };
  wanixSystem?.addEventListener("ready", onReady);
}

// ========== Components ==========

// Terminal panel: creates wanix-task + wanix-term
// Compact header action: tap creates a terminal, long-press opens extensions.
