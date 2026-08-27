import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DockviewReact } from "dockview-react";
// Side-effect import: registers all enterprise modules (incl. the license
// gate) onto the shared `dockview` instance (importmap resolves both
// packages to the same module URL). Kept deliberately, do not remove.
import { LicenseManager } from "dockview-enterprise";

import {
  addCrushRunnerPanel,
  CrushRunnerPanel,
  initCrushRunner,
} from "./crush-runner.js?v=20260826.2";
import {
  addLandingPanel,
  initHome,
  LandingPanel,
} from "./home.js?v=20260812.20";
import {
  addSettingsPanel,
  initSettings,
  SettingsPanel,
  TerminalPresetIconPicker,
} from "./settings.js?v=20260826.9";
import { FilesPanel } from "./files.js?v=20260826.42";
import { addFilesPanel, initFiles } from "./files-registry.js?v=20260826.9";
import {
  addRuntimePanel,
  initRuntime,
  RuntimePanel,
} from "./runtime.js?v=20260826.42";
import { addDeckPanel, DeckPanel, initDeck } from "./deck.js?v=20260812.29";
import {
  addFallbackPanel,
  AddTerminalButton,
  FallbackPanel,
  initLauncher,
} from "./launcher.js?v=20260812.33";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  GroupPanel as GroupPanelFromPanels,
  IframePanel as IframePanelFromPanels,
  initPanels,
  PanelTab,
  TerminalPanel as TerminalPanelFromPanels,
  VmPanel as VmPanelFromPanels,
  WagiDogPet as WagiDogPetFromPanels,
  WorkbenchPanel as WorkbenchPanelFromPanels,
  WorkspaceTaskPanel as WorkspaceTaskPanelFromPanels,
} from "./panels.js?v=20260812.35";
import {
  ensureGearShellBinds,
  initWorkspaceApi,
} from "./workspace-api.js?v=20260828.11";

import {
  getWanixRoot,
  setSystemReady,
  setTerminalLayer,
  setWanixSystem,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { createWanixSystem } from "./app-wanix.js?v=20260826.2";
import {
  addWorkspaceBind,
  addWorkspaceSystemBind,
  addWorkspaceTask,
  createWorkspaceFromPreset,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  getCrushRunnerPresets,
  importWorkspace,
  loadActiveWorkspace,
  loadConfig,
  loadWorkspace,
  makeBindItemDraggable,
  normalizeCrushRunnerPreset,
  parseWorkspaceJson,
  removeWorkspaceBind,
  removeWorkspaceSystemBind,
  removeWorkspaceTask,
  renameWorkspace,
  reorderWorkspaceBinds,
  reorderWorkspaceSystemBinds,
  replaceActiveWorkspace,
  resetConfig,
  saveConfig,
  saveCrushRunnerPresets,
  saveWorkspace,
  saveWorkspaceSystemSettings,
  setActiveWorkspaceId,
  setWagiDogEnabled,
  updateWorkspaceBind,
  updateWorkspaceIndex,
  updateWorkspaceSystemBind,
  updateWorkspaceTask,
} from "./app-workspace.js?v=20260826.2";
import {
  listWorkspacePresets,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
} from "./app-workspace-presets.js?v=20260826.2";
import {
  blankCrushRunnerPresetDraft,
  clone,
  getActiveCrushRunnerPreset,
  getTerminalPresetIcon,
  normalizeLauncherOrder,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  normalizeVmWispUrl,
} from "./app-normalize.js?v=20260828.2";
import {
  buildEnv,
  getDefaultTerminalProfile,
  getTerminalProfiles,
  getVmPanelConfig,
  getWorkbenchPanelConfig,
  saveTerminalProfiles,
  terminalCommand,
} from "./app-terminal-profiles.js?v=20260826.2";
import {
  attachOverlayTerminalSession,
  attachTerminalSession,
  createTerminalSession,
  destroyTerminalSession,
  hideTerminalLayer,
  restoreTerminalLayer,
  wakeTerminalSession,
} from "./app-terminal-sessions.js?v=20260826.2";
import {
  attachIframeSession,
  attachVmSession,
  attachWorkbenchSession,
  destroyIframeSession,
  destroyVmSession,
  destroyWorkbenchSession,
  waitForWanixSystem,
} from "./app-sessions.js?v=20260828.5";
import {
  attachWorkspaceTaskSession,
  destroyWorkspaceTaskSession,
  getWorkspaceTaskSession,
  taskEnvLines,
  wakeWorkspaceTaskSession,
} from "./app-workspace-task-sessions.js?v=20260828.5";
import {
  forgetOpenPanel,
  getDockviewApi,
  rememberOpenPanel,
  setDockviewApi,
} from "./app-panels-store.js?v=20260826.2";
import {
  autoStartWorkspaceTasks,
  blankTerminalPresetDraft,
  IFRAME_PANEL_OPTIONS,
  PANEL_CREATION_OPTIONS,
  restoreSavedPanels,
  whenWanixReady,
} from "./app-panels.js?v=20260826.2";
import {
  dismissHomeDebugErrors,
  DOCKVIEW_LICENSE_KEY,
  HOME,
  reportHomeError,
  showHomeDebugErrors,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
  WANIX,
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_TASK_STATUS_EVENT,
} from "./app-constants.js?v=20260828.4";

// Set the license key before any DockviewComponent is created so the
// watermark never renders; a late setLicenseKey also works (LicenseModule
// subscribes to the registry change and refreshes).
LicenseManager.setLicenseKey(DOCKVIEW_LICENSE_KEY);

const systemWorkspace = loadActiveWorkspace();
// Inject the agent-control binds (shared /gearshell dir + the gctl CLI)
// before the namespace is built, so every task sees them this session.
ensureGearShellBinds(systemWorkspace);
await import(systemWorkspace.runtime.moduleUrl || WANIX_RUNTIME.moduleUrl);
const wanixSystem = createWanixSystem(systemWorkspace);
setSystemReady(Boolean(wanixSystem?.isReady));
setWanixSystem(wanixSystem);
setTerminalLayer(wanixSystem.querySelector("#terminal-layer"));
wanixSystem?.addEventListener("ready", (event) => {
  if (event.target !== wanixSystem) return;
  setSystemReady(true);
  for (const session of terminalSessions.values()) wakeTerminalSession(session);
  for (const session of workspaceTaskSessions.values()) {
    wakeWorkspaceTaskSession(session);
  }
});

function handlePanelRemoved(api, panel) {
  const match = /^terminal-(\d+)$/.exec(panel.id);
  if (match) destroyTerminalSession(Number(match[1]));
  const iframeMatch = /^iframe-(\d+)$/.exec(panel.id);
  if (iframeMatch) destroyIframeSession(Number(iframeMatch[1]));
  const workbenchMatch = /^workbench-(\d+)$/.exec(panel.id);
  if (workbenchMatch) destroyWorkbenchSession(Number(workbenchMatch[1]));
  const vmMatch = /^vm-(\d+)$/.exec(panel.id);
  if (vmMatch) destroyVmSession(Number(vmMatch[1]));
  const workspaceTaskMatch = /^workspace-task-(\d+)$/.exec(panel.id);
  if (workspaceTaskMatch) {
    destroyWorkspaceTaskSession(Number(workspaceTaskMatch[1]));
  }
  forgetOpenPanel(panel.id);
  requestAnimationFrame(() => {
    if (api.panels.length === 0) addFallbackPanel(api);
  });
}

function trackActivePanel(api) {
  // Remember which panel is active so a future reload with Restore tabs can
  // reactivate the same tab instead of always landing on the last-added one.
  api.onDidActivePanelChange((activeEvent) => {
    if (!activeEvent.panel) return;
    const idx = api.panels.findIndex((p) => p.id === activeEvent.panel.id);
    if (idx < 0) return;
    const workspace = loadActiveWorkspace();
    if (workspace.ui?.activeOpenPanelIndex === idx) return;
    workspace.ui = { ...workspace.ui, activeOpenPanelIndex: idx };
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  });
}

function openStartupPanels(api) {
  const cfg = loadConfig();
  const restored = cfg.restoreTabs && restoreSavedPanels(api);
  if (!restored) {
    for (const component of cfg.startupPanels) {
      addPanelByComponentFromPanels(api, component);
    }
  }
  if (api.panels.length === 0) addFallbackPanel(api);
  return restored;
}

function App() {
  const onReady = useCallback((event) => {
    setDockviewApi(event.api);
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);
    event.api.onDidRemovePanel((panel) => handlePanelRemoved(event.api, panel));
    const restored = openStartupPanels(event.api);
    trackActivePanel(event.api);
    // Start configured processes only after Wanix is ready so they follow the
    // same allocation path as tasks opened from Settings. Restored task tabs
    // already represent the prior session, so do not create duplicates.
    whenWanixReady(() => {
      if (!restored) autoStartWorkspaceTasks(event.api);
    });
  }, []);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(DockviewReact, {
      className: "dockview-theme-github-dark",
      onReady,
      // --- dockview-enterprise 特性 (opt-in 选项, 模块已由
      // `import { LicenseManager } from "dockview-enterprise"` 注册) ---
      // 固定标签: 独立第二行 + VS Code 式跨边界拖拽翻转
      pinnedTabs: {
        enabled: true,
        mode: "separate-row",
        togglePinOnCrossBoundaryDrag: true,
      },
      // 高级溢出: 弹出层带搜索 + MRU 排序 (换行模式用 mode: "wrap")
      overflow: { mode: "show", mru: true, search: true },
      // 布局历史: 误关面板可 api.undo() 恢复
      layoutHistory: { enabled: true },
      // 拖拽罗盘 + 智能参考线 (浮动窗口)
      dndCompass: {},
      smartGuides: {},
      // 左边缘自动隐藏组 (VS 式工具窗)
      autoHideEdgeGroups: { left: true },
      // 键盘导航 + 键盘移动共用一个选项; dock 键重绑为 Ctrl+Shift+M,
      // 避免劫持终端里的 Ctrl+M (bash 回车)
      keyboardNavigation: { keymap: { dock: "ctrl+shift+m" } },
      components: {
        home: LandingPanel,
        deck: DeckPanel,
        settings: SettingsPanel,
        files: FilesPanel,
        runtime: RuntimePanel,
        workbench: WorkbenchPanelFromPanels,
        vm: VmPanelFromPanels,
        fallback: FallbackPanel,
        task: WorkspaceTaskPanelFromPanels,
        terminal: TerminalPanelFromPanels,
        group: GroupPanelFromPanels,
        iframe: IframePanelFromPanels,
        "crush-runner": CrushRunnerPanel, // from ./crush-runner.js
      },
      defaultTabComponent: PanelTab,
      rightHeaderActionsComponent: AddTerminalButton,
    }),
    React.createElement(WagiDogPetFromPanels),
  );
}

// --- Mount React app ---
const rootEl = document.getElementById("app-root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(React.createElement(App));
}

// Initialise the Launcher submodule with the helpers it needs at
// runtime. The launcher panel reads the workspace config (so it can
// know which items are collapsed in the More menu), the
// panel-creation catalog (so it can render the right icon / label
// for each launcher button), the terminal profile catalog + helpers
// (so the Terminal launch picker can show the available profiles),
// and the dockview dispatch (so the launcher buttons can add new
// panels into the same group as the launcher).
initLauncher({
  WORKSPACE_CHANGED_EVENT,
  loadConfig,
  normalizeLauncherOrder,
  addPanelByComponent: addPanelByComponentFromPanels,
  addTerminalPanel: addTerminalPanelFromPanels,
  getTerminalProfiles,
  getTerminalPresetIcon,
  terminalCommand,
  PANEL_CREATION_OPTIONS,
  getDefaultTerminalProfile,
  saveConfig,
  resetConfig,
  setWagiDogEnabled,
  rememberOpenPanel,
});

// Initialise the Panels submodule with the deps its 15 atomic
// panels + 7 add*Panel dispatchers need. The dep list is the longest
// of any module because each panel type reads a different slice of
// app.js (overlay session attachers, the panel-creation catalog,
// the IFRAME panel options table, the WORKSPACE_*_EVENT constants,
// the per-type id counters, plus the workspace + config helpers).
initPanels({
  attachTerminalSession,
  attachWorkbenchSession,
  attachVmSession,
  attachWorkspaceTaskSession,
  attachIframeSession,
  loadActiveWorkspace,
  loadWorkspace,
  loadConfig,
  saveConfig,
  resetConfig,
  rememberOpenPanel,
  clone,
  IFRAME_PANEL_OPTIONS,
  PANEL_CREATION_OPTIONS,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_TASK_STATUS_EVENT,
  getWorkspaceTaskSession,
  taskEnvLines,
  getTerminalPresetIcon,
  getVmPanelConfig,
  getWorkbenchPanelConfig,
  getDefaultTerminalProfile,
  // Cross-module add*Panel dispatchers so panels.js can route every
  // component name (home / deck / settings / files / runtime /
  // fallback / crush-runner) through a single PANEL_ADDERS table.
  addLandingPanel,
  addDeckPanel,
  addSettingsPanel,
  addFilesPanel,
  addRuntimePanel,
  addFallbackPanel,
  addCrushRunnerPanel,
});

// Initialise the Deck submodule with the helpers it needs at
// runtime. The deck panel only needs the debug-overlay helpers and
// the CDN-loaded Reveal + marked globals (passed through the dep
// shim so deck.js never reaches into the global scope directly).
initDeck({
  Reveal: typeof window !== "undefined" ? window.Reveal : undefined,
  marked: typeof window !== "undefined" ? window.marked : undefined,
  reportHomeError,
  dismissHomeDebugErrors,
  showHomeDebugErrors,
  rememberOpenPanel,
});

// Initialise the Runtime submodule with the helpers it needs at
// runtime. The panel reads wanix state (systemReady / getWanixRoot)
// plus the live terminal + task session Maps (kept in app.js since
// the TerminalPanel / WorkspaceTaskPanel also write to them).
initRuntime({
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  getWanixRoot,
  loadActiveWorkspace,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
  rememberOpenPanel,
});

// Initialise the Files submodule with the helpers it needs at
// runtime. The panel only reads the wanix filesystem root and
// subscribes to the wanix-system ready event; everything else is
// self-contained inside files.js.
initFiles({
  wanixSystem,
  getWanixRoot,
  rememberOpenPanel,
  HOME,
  loadConfig,
  saveConfig,
});

// Initialise the Settings submodule with the helpers it needs at
// runtime. Done at the bottom of the module so every helper defined
// above is available as a dependency. The shell calls the setup*Form
// helpers that wire each <details> section; setupConfigForm has
// already migrated into settings.js and is no longer passed as a dep.
// The remaining setup*Form helpers (workspace / preset / system /
// bind / task / terminal-profile) will migrate in follow-up commits.
initSettings({
  loadConfig,
  saveConfig,
  resetConfig,
  normalizeLauncherOrder,
  normalizeVmWispUrl,
  PANEL_CREATION_OPTIONS,
  WORKSPACE_CHANGED_EVENT,
  WANIX_RUNTIME,
  rememberOpenPanel,
  // Workspace / preset / system helpers
  createWorkspaceFromPreset,
  listWorkspacePresets,
  loadActiveWorkspace,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  importWorkspace,
  parseWorkspaceJson,
  renameWorkspace,
  replaceActiveWorkspace,
  setActiveWorkspaceId,
  addWorkspaceSystemBind,
  makeBindItemDraggable,
  removeWorkspaceSystemBind,
  reorderWorkspaceSystemBinds,
  saveWorkspaceSystemSettings,
  updateWorkspaceSystemBind,
  // Task + bind helpers (used by setupTaskForm and setupBindForm)
  addWorkspaceBind,
  addWorkspaceTask,
  addWorkspaceTaskPanel: addWorkspaceTaskPanelFromPanels,
  removeWorkspaceBind,
  removeWorkspaceTask,
  reorderWorkspaceBinds,
  updateWorkspaceBind,
  updateWorkspaceTask,
  // Terminal preset helpers (used by TerminalPresetEditor and the
  // Lucide icon picker that lives next to it)
  getTerminalProfiles,
  saveTerminalProfiles,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  blankTerminalPresetDraft,
  getTerminalPresetIcon,
  terminalCommand,
  TerminalPresetIconPicker,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
});

// Initialise the Home submodule with the helpers it needs at runtime.
// Done at the bottom of the module so every helper defined above is
// available as a dependency. Home only needs the dispatch function and
// a live view of the dockview root to fall back to when the panel is
// not given an explicit containerApi.
initHome({
  addPanelByComponent: addPanelByComponentFromPanels,
  getDockviewApi,
  rememberOpenPanel,
});

// Initialise the CrushRunner submodule with the helpers it needs at
// runtime. Done at the bottom of the module so every helper defined
// above is available as a dependency.
initCrushRunner({
  HOME,
  WANIX,
  createTerminalSession,
  attachOverlayTerminalSession,
  destroyTerminalSession,
  addTerminalPanel: addTerminalPanelFromPanels,
  waitForWanixSystem,
  getWanixRoot,
  buildEnv,
  getTerminalProfiles,
  loadConfig,
  saveTerminalProfiles,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  TerminalPresetIconPicker,
  getCrushRunnerPresets,
  getActiveCrushRunnerPreset,
  saveCrushRunnerPresets,
  normalizeCrushRunnerPreset,
  blankCrushRunnerPresetDraft,
  getTerminalPresetIcon,
  TERMINAL_PRESET_ICON_BY_ID,
  WORKSPACE_CHANGED_EVENT,
  rememberOpenPanel,
});

// Initialise the Workspace API: expose window.GearShell to agents (via
// the kernel's jsfs /js projection) and ensure the active workspace
// carries the gctl bind.
initWorkspaceApi();
