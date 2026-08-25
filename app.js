import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewDefaultTab, DockviewReact } from 'dockview-react';
import { Activity, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Bot, Check, ChevronDown, Code2, Cpu, Dog, Download, Ellipsis, Eye, EyeOff, FileCode2, FilePlus2, FolderOpen, FolderPlus, Github, Globe2, GripVertical, House, Layers, LayoutDashboard, Monitor, Music2, Pencil, Play, Plus, RefreshCw, Rocket, Save, Settings, Terminal, Trash2, TreePine, Upload, UsersRound, X, Zap, icons as LucideIcons } from 'lucide-react';

import {
  addCrushRunnerPanel, CrushRunnerPanel, initCrushRunner, reserveCrushRunnerIds,
  getBuiltinCrushRunnerPresets, BUILTIN_CRUSH_RUNNER_PRESET_IDS, DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
} from './crush-runner.js?v=20260812.20';
import { addLandingPanel, LandingPanel, initHome } from './home.js?v=20260812.20';
import { addSettingsPanel, SettingsPanel, initSettings, TerminalPresetIconPicker } from './settings.js?v=20260812.31';
import { addFilesPanel, FilesPanel, initFiles } from './files.js?v=20260812.26';
import { addRuntimePanel, RuntimePanel, initRuntime } from './runtime.js?v=20260812.28';
import { addDeckPanel, DeckPanel, initDeck } from './deck.js?v=20260812.29';
import { addFallbackPanel, FallbackPanel, initLauncher, AddTerminalButton } from './launcher.js?v=20260812.33';
import {
  addTerminalPanel as addTerminalPanelFromPanels, addWorkbenchPanel as addWorkbenchPanelFromPanels,
  addVmPanel as addVmPanelFromPanels, addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  addGroupPanel as addGroupPanelFromPanels, addIframePanel as addIframePanelFromPanels,
  addPanelByComponent as addPanelByComponentFromPanels,
  TerminalPanel as TerminalPanelFromPanels,
  GroupPanel as GroupPanelFromPanels,
  IframePanel as IframePanelFromPanels,
  WorkbenchPanel as WorkbenchPanelFromPanels,
  VmPanel as VmPanelFromPanels,
  WorkspaceTaskPanel as WorkspaceTaskPanelFromPanels,
  PanelTab,
  WagiDogPet as WagiDogPetFromPanels,
  initPanels, PANEL_ICONS,
} from './panels.js?v=20260812.32';

import { setWanixSystem, setSystemReady, systemReady, setTerminalLayer, terminalSessions, workspaceTaskSessions, getWanixRoot } from "./app-state.js?v=20260825.2";
import { createWanixSystem } from "./app-wanix.js?v=20260825.2";
import { loadActiveWorkspace, loadWorkspace, loadConfig, saveConfig, resetConfig, setWagiDogEnabled, updateWorkspaceIndex, saveWorkspace, normalizeCrushRunnerPreset, getCrushRunnerPresets, saveCrushRunnerPresets, addWorkspaceBind, removeWorkspaceBind, updateWorkspaceBind, reorderWorkspaceBinds, validateSystemBind, updateWorkspaceSystem, saveWorkspaceSystemSettings, addWorkspaceSystemBind, updateWorkspaceSystemBind, removeWorkspaceSystemBind, reorderWorkspaceSystemBinds, makeBindItemDraggable, addWorkspaceTask, removeWorkspaceTask, updateWorkspaceTask, getActiveWorkspaceId, setActiveWorkspaceId, createWorkspaceFromPreset, duplicateWorkspace, renameWorkspace, deleteWorkspace, parseWorkspaceJson, importWorkspace, replaceActiveWorkspace, updateActiveWorkspace, ensureWorkspaceStore } from "./app-workspace.js?v=20260825.2";
import { listWorkspacePresets, loadCustomWorkspacePreset, removeCustomWorkspacePreset, saveCustomWorkspacePreset, uniqueWorkspacePresetName } from "./app-workspace-presets.js?v=20260825.2";
import { clone, normalizeTerminalProfile, normalizeTerminalProfileOrder, normalizeLauncherOrder, normalizeVmWispUrl, getTerminalPresetIcon, getActiveCrushRunnerPreset, blankCrushRunnerPresetDraft } from "./app-normalize.js?v=20260825.2";
import { getTerminalProfiles, getDefaultTerminalProfile, getWorkbenchPanelConfig, getVmPanelConfig, terminalCommand, saveTerminalProfiles, buildEnv } from "./app-terminal-profiles.js?v=20260825.2";
import { createTerminalSession, attachOverlayTerminalSession, destroyTerminalSession, wakeTerminalSession, hideTerminalLayer, restoreTerminalLayer, attachTerminalSession, layoutTerminalSession, focusTerminalSession, getTerminalSession } from "./app-terminal-sessions.js?v=20260825.2";
import { wakeWorkspaceTaskSession, attachWorkbenchSession, attachVmSession, attachWorkspaceTaskSession, attachIframeSession, destroyIframeSession, destroyWorkbenchSession, destroyVmSession, destroyWorkspaceTaskSession, getWorkspaceTaskSession, waitForWanixSystem } from "./app-sessions.js?v=20260825.2";
import { rememberOpenPanel, forgetOpenPanel, setDockviewApi, getDockviewApi } from "./app-panels-store.js?v=20260825.2";
import { blankTerminalPresetDraft, IFRAME_PANEL_OPTIONS, PANEL_CREATION_OPTIONS, restoreSavedPanels, whenWanixReady, autoStartWorkspaceTasks } from "./app-panels.js?v=20260825.2";
import { WANIX, HOME, WANIX_RUNTIME, WORKSPACE_CHANGED_EVENT, WORKSPACE_TASK_STATUS_EVENT, TERMINAL_PRESET_ICON_BY_ID, TERMINAL_PRESET_ICON_OPTIONS, reportHomeError, dismissHomeDebugErrors, showHomeDebugErrors } from "./app-constants.js?v=20260825.2";
import { getWanixRoot as getWanixRoot2 } from "./app-state.js?v=20260825.2";

const systemWorkspace = loadActiveWorkspace();
await import(systemWorkspace.runtime.moduleUrl || WANIX_RUNTIME.moduleUrl);
const wanixSystem = createWanixSystem(systemWorkspace);
setSystemReady(Boolean(wanixSystem?.isReady));
setWanixSystem(wanixSystem);
setTerminalLayer(wanixSystem.querySelector('#terminal-layer'));
wanixSystem?.addEventListener('ready', (event) => {
  if (event.target !== wanixSystem) return;
  setSystemReady(true);
  for (const session of terminalSessions.values()) wakeTerminalSession(session);
  for (const session of workspaceTaskSessions.values()) wakeWorkspaceTaskSession(session);
});


function App() {
  const onReady = useCallback((event) => {
    setDockviewApi(event.api);
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);

    event.api.onDidRemovePanel((panel) => {
      const match = /^terminal-(\d+)$/.exec(panel.id);
      if (match) destroyTerminalSession(Number(match[1]));
      const iframeMatch = /^iframe-(\d+)$/.exec(panel.id);
      if (iframeMatch) destroyIframeSession(Number(iframeMatch[1]));
      const workbenchMatch = /^workbench-(\d+)$/.exec(panel.id);
      if (workbenchMatch) destroyWorkbenchSession(Number(workbenchMatch[1]));
      const vmMatch = /^vm-(\d+)$/.exec(panel.id);
      if (vmMatch) destroyVmSession(Number(vmMatch[1]));
      const workspaceTaskMatch = /^workspace-task-(\d+)$/.exec(panel.id);
      if (workspaceTaskMatch) destroyWorkspaceTaskSession(Number(workspaceTaskMatch[1]));
      forgetOpenPanel(panel.id);
      requestAnimationFrame(() => {
        if (event.api.panels.length === 0) addFallbackPanel(event.api);
      });
    });

    const cfg = loadConfig();
    const restored = cfg.restoreTabs && restoreSavedPanels(event.api);
    if (!restored) {
      for (const component of cfg.startupPanels) addPanelByComponentFromPanels(event.api, component);
    }
    if (event.api.panels.length === 0) addFallbackPanel(event.api);

    // Remember which panel is active so a future reload with Restore tabs can
    // reactivate the same tab instead of always landing on the last-added one.
    const dockviewRoot = event.api;
    event.api.onDidActivePanelChange((activeEvent) => {
      if (!activeEvent.panel) return;
      const idx = dockviewRoot.panels.findIndex((p) => p.id === activeEvent.panel.id);
      if (idx < 0) return;
      const workspace = loadActiveWorkspace();
      if (workspace.ui?.activeOpenPanelIndex === idx) return;
      workspace.ui = { ...workspace.ui, activeOpenPanelIndex: idx };
      saveWorkspace(workspace);
      updateWorkspaceIndex(workspace);
    });

    // Start configured processes only after Wanix is ready so they follow the
    // same allocation path as tasks opened from Settings. Restored task tabs
    // already represent the prior session, so do not create duplicates.
    whenWanixReady(() => {
      if (!restored) autoStartWorkspaceTasks(event.api);
    });
  }, []);

  return React.createElement(React.Fragment, null,
    React.createElement(DockviewReact, {
      className: 'dockview-theme-github-dark',
      onReady,
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
        'crush-runner': CrushRunnerPanel,  // from ./crush-runner.js
      },
      defaultTabComponent: PanelTab,
      rightHeaderActionsComponent: AddTerminalButton,
    }),
    React.createElement(WagiDogPetFromPanels),
  );
}

// --- Mount React app ---
const rootEl = document.getElementById('app-root');
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
  attachTerminalSession, attachWorkbenchSession, attachVmSession,
  attachWorkspaceTaskSession, attachIframeSession,
  loadActiveWorkspace, loadWorkspace, loadConfig, saveConfig, resetConfig,
  rememberOpenPanel, clone,
  IFRAME_PANEL_OPTIONS, PANEL_CREATION_OPTIONS,
  WORKSPACE_CHANGED_EVENT, WORKSPACE_TASK_STATUS_EVENT,
  getWorkspaceTaskSession, getTerminalPresetIcon,
  getVmPanelConfig, getWorkbenchPanelConfig,
  getDefaultTerminalProfile,
  // Cross-module add*Panel dispatchers so panels.js can route every
  // component name (home / deck / settings / files / runtime /
  // fallback / crush-runner) through a single PANEL_ADDERS table.
  addLandingPanel, addDeckPanel, addSettingsPanel, addFilesPanel,
  addRuntimePanel, addFallbackPanel, addCrushRunnerPanel,
});

// Initialise the Deck submodule with the helpers it needs at
// runtime. The deck panel only needs the debug-overlay helpers and
// the CDN-loaded Reveal + marked globals (passed through the dep
// shim so deck.js never reaches into the global scope directly).
initDeck({
  Reveal: typeof window !== 'undefined' ? window.Reveal : undefined,
  marked: typeof window !== 'undefined' ? window.marked : undefined,
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

