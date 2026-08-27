// Panel creation catalog + saved-panel restore (500-line rule split).

import { systemReady, wanixSystem } from "./app-state.js?v=20260826.2";
import {
  loadActiveWorkspace,
  loadWorkspace,
} from "./app-workspace.js?v=20260826.3";
import {
  getDefaultTerminalProfile,
  getVmPanelConfig,
  getWorkbenchPanelConfig,
} from "./app-terminal-profiles.js?v=20260826.3";
import {
  getSavedOpenPanels,
  parseCrushRunnerPanelId,
} from "./app-panels-store.js?v=20260826.3";
import { reserveCrushRunnerIds } from "./crush-runner.js?v=20260826.2";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addVmPanel as addVmPanelFromPanels,
  addWorkbenchPanel as addWorkbenchPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
} from "./panels.js?v=20260812.35";
import {
  Activity,
  Bot,
  Code2,
  Cpu,
  FolderOpen,
  Globe2,
  House,
  LayoutDashboard,
  Monitor,
  Music2,
  Rocket,
  Settings,
  Terminal,
  TreePine,
  UsersRound,
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

export const IFRAME_PANEL_OPTIONS = {
  browser: {
    title: "Browser",
    src: "/browser/",
    panelType: "browser",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  bonsai: {
    title: "Bonsai 27B",
    src: "/bonsai/",
    panelType: "bonsai",
    allow: "clipboard-read; clipboard-write; fullscreen",
    allowFullscreen: true,
  },
  codigo: { title: "Codigo", src: "https://codigo.dev", panelType: "codigo" },
  crush: {
    title: "Crush",
    src: "https://justwasm.github.io/crush/",
    panelType: "crush",
  },
  rickroll: {
    title: "Rick Roll",
    src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    panelType: "rickroll",
    allow:
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    allowFullscreen: true,
  },
};

export const PANEL_CREATION_OPTIONS = [
  { component: "terminal", label: "Terminal", icon: Terminal },
  { component: "fallback", label: "Launcher", icon: Rocket },
  { component: "home", label: "Home", icon: House },
  { component: "deck", label: "Deck", icon: LayoutDashboard },
  { component: "workbench", label: "Workbench", icon: Monitor },
  { component: "vm", label: "VM", icon: Cpu },
  { component: "settings", label: "Settings", icon: Settings },
  { component: "files", label: "Files", icon: FolderOpen },
  { component: "runtime", label: "Runtime", icon: Activity },
  { component: "group", label: "Group", icon: UsersRound },
  { component: "browser", label: "Browser", icon: Globe2 },
  { component: "bonsai", label: "Bonsai 27B", icon: TreePine },
  { component: "codigo", label: "Codigo", icon: Code2 },
  { component: "crush", label: "Crush", icon: Bot },
  { component: "crush-runner", label: "Crush Runner", icon: Rocket },
  { component: "rickroll", label: "Rick Roll", icon: Music2 },
];

function reserveMaxCrushRunnerId(panels) {
  // Make sure the Crush Runner id counter never collides with a
  // restored panel id. Legacy snapshots did not record panelId, so
  // lifting the counter past the largest id we can derive from any
  // stored panel id still protects against collisions when the user
  // opens a fresh Crush Runner panel after a reload.
  let maxCrushRunnerId = 0;
  for (const panel of panels) {
    if (panel.component !== "crush-runner") continue;
    const parsed = parseCrushRunnerPanelId(panel.panelId);
    if (Number.isFinite(parsed) && parsed > maxCrushRunnerId) {
      maxCrushRunnerId = parsed;
    }
  }
  reserveCrushRunnerIds(maxCrushRunnerId);
}

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
  } else if (panel.component === "vm") {
    addVmPanelFromPanels(api, undefined, panel.config || getVmPanelConfig());
  } else if (panel.component === "task" && panel.task) {
    addWorkspaceTaskPanelFromPanels(
      api,
      panel.task,
      loadWorkspace(panel.workspaceId) || loadActiveWorkspace(),
    );
  } else if (panel.component === "crush-runner") {
    // Restore the original Crush Runner panel id so the tab title
    // ("Crush Runner N") and the linked terminal launch ids stay
    // stable across reloads; otherwise the module-level counter in
    // crush-runner.js would mint fresh numbers and the previous
    // session's panels would silently disappear or collide.
    const restoredId = parseCrushRunnerPanelId(panel.panelId);
    addPanelByComponentFromPanels(api, panel.component, undefined, {
      id: restoredId,
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
  reserveMaxCrushRunnerId(panels);
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
