import React from "react";
import { createRoot } from "react-dom/client";

// Side-effect import: registers all enterprise modules (incl. the license
// gate) onto the shared `dockview` instance (importmap resolves both
// packages to the same module URL). Kept deliberately, do not remove.
import { LicenseManager } from "dockview-enterprise";

import {
  addCrushRunnerPanel,
  initCrushRunner,
} from "./crush-runner.js?v=20260826.47";
import { addLandingPanel, initHome } from "./home.js?v=20260812.23";
import {
  addSettingsPanel,
  initSettings,
  TerminalPresetIconPicker,
} from "./settings.js?v=20260826.37";

import { addFilesPanel, initFiles } from "./files-registry.js?v=20260826.27";
import { addRuntimePanel, initRuntime } from "./runtime.js?v=20260826.44";
import { addMusicPanel, initMusic } from "./music.js?v=20260829.7";
import { addDeckPanel, initDeck } from "./deck.js?v=20260812.30";
import { addFallbackPanel, initLauncher } from "./launcher.js?v=20260812.39";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  initPanels,
} from "./panels.js?v=20260812.43";
import {
  ensureGearShellBinds,
  initWorkspaceApi,
  workspaceApi,
} from "./workspace-api.js?v=20260828.68";
import {
  clearAuditEntries,
  listAuditEntries,
  undoAuditEntry,
} from "./workspace-audit.js?v=20260829.27";
import { App } from "./app-shell.js?v=20260828.58";

import {
  getWanixRoot,
  setSystemReady,
  setTerminalLayer,
  setWanixSystem,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { createWanixSystem } from "./app-wanix.js?v=20260826.52";
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
  saveWorkspaceSystemSettings,
  setActiveWorkspaceId,
  setWagiDogEnabled,
  updateWorkspaceBind,
  updateWorkspaceSystemBind,
  updateWorkspaceTask,
} from "./app-workspace.js?v=20260826.52";
import {
  listWorkspacePresets,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
} from "./app-workspace-presets.js?v=20260826.52";
import {
  blankCrushRunnerPresetDraft,
  clone,
  getActiveCrushRunnerPreset,
  getTerminalPresetIcon,
  normalizeLauncherOrder,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  normalizeVmWispUrl,
} from "./app-normalize.js?v=20260828.53";
import {
  buildEnv,
  getDefaultTerminalProfile,
  getTerminalProfiles,
  getVmPanelConfig,
  getWorkbenchPanelConfig,
  saveTerminalProfiles,
  terminalCommand,
} from "./app-terminal-profiles.js?v=20260826.52";
import {
  attachOverlayTerminalSession,
  attachTerminalSession,
  createTerminalSession,
  destroyTerminalSession,
  wakeTerminalSession,
} from "./app-terminal-sessions.js?v=20260826.52";
import {
  attachIframeSession,
  attachVmSession,
  attachWorkbenchSession,
  waitForWanixSystem,
} from "./app-sessions.js?v=20260828.56";
import {
  attachWorkspaceTaskSession,
  getWorkspaceTaskSession,
  taskEnvLines,
  wakeWorkspaceTaskSession,
} from "./app-workspace-task-sessions.js?v=20260828.58";
import {
  getDockviewApi,
  rememberOpenPanel,
} from "./app-panels-store.js?v=20260826.52";
import {
  blankTerminalPresetDraft,
  IFRAME_PANEL_OPTIONS,
  PANEL_CREATION_OPTIONS,
} from "./app-panels.js?v=20260826.53";
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
} from "./app-constants.js?v=20260828.21";

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
  addMusicPanel,
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

// Initialise the Music submodule with the helpers it needs at
// runtime. The panel is a thin UI over the music-engine singleton
// (shared with gctl music.*); it only needs panel registration.
initMusic({
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
  // Agent config-audit ring (Settings "Agent activity" section)
  auditList: listAuditEntries,
  auditUndo: undoAuditEntry,
  auditClear: clearAuditEntries,
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
  workspaceApi,
  WORKSPACE_TASK_STATUS_EVENT,
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
