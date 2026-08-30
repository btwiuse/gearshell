import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { createRoot } from "react-dom/client";

// Side-effect import: registers all enterprise modules (incl. the license
// gate) onto the shared `dockview` instance (importmap resolves both
// packages to the same module URL). Kept deliberately, do not remove.
import { LicenseManager } from "dockview-enterprise";

import {
  initCrushRunner,
} from "./plugin/crush-runner/crush-runner.js?v=20260826.146";
import { addLandingPanel, initHome } from "./plugin/home/home.js?v=20260812.35";
import {
  initSettings,
  TerminalPresetIconPicker,
} from "./plugin/settings/settings.js?v=20260826.144";

import { initFiles } from "./plugin/files/files-registry.js?v=20260826.116";
import { initRuntime } from "./plugin/runtime/runtime.js?v=20260826.51";
import {
  getPluginBootPromise,
  initPlugins,
  registerSyncPlugins,
} from "./plugins.js?v=20260829.114";
import { registerPluginsSettingsSection } from "./settings-plugins.js?v=20260829.124";
import {
  addPluginsPanel,
  initPluginsPanel,
} from "./plugins-panel.js?v=20260829.87";
import { initDeck } from "./plugin/deck/deck.js?v=20260812.42";
import { initLauncher } from "./plugin/launcher/launcher.js?v=20260812.48";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  initPanels,
} from "./panels.js?v=20260812.138";
import {
  ensureGearShellBinds,
  initWorkspaceApi,
  workspaceApi,
} from "./workspace-api.js?v=20260828.166";
import { ensurePluginToolBinds } from "./app-plugin-binds.js?v=20260830.72";
import { primePluginContentCache } from "./app-plugin-cache.js?v=20260830.2";
import { loadW9yRegistry, ensureW9yDependencies } from "./app-w9y-registry.js?v=20260830.41";
import {
  clearAuditEntries,
  listAuditEntries,
  undoAuditEntry,
} from "./workspace-audit.js?v=20260829.125";
import { App, PANEL_COMPONENTS } from "./app-shell.js?v=20260828.171";

import {
  getWanixRoot,
  setSystemReady,
  setTerminalLayer,
  setWanixSystem,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js?v=20260826.2";
import { createWanixSystem } from "./app-wanix.js?v=20260826.150";
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
} from "./app-workspace.js?v=20260826.150";
import {
  listWorkspacePresets,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
} from "./app-workspace-presets.js?v=20260826.150";
import {
  blankCrushRunnerPresetDraft,
  clone,
  getActiveCrushRunnerPreset,
  getTerminalPresetIcon,
  normalizeLauncherOrder,
  normalizePlugin,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  normalizeVmWispUrl,
} from "./app-normalize.js?v=20260828.151";
import {
  buildEnv,
  getDefaultTerminalProfile,
  getTerminalProfiles,
  getVmPanelConfig,
  getWorkbenchPanelConfig,
  saveTerminalProfiles,
  terminalCommand,
} from "./app-terminal-profiles.js?v=20260826.150";
import {
  attachOverlayTerminalSession,
  attachTerminalSession,
  createTerminalSession,
  destroyTerminalSession,
  wakeTerminalSession,
} from "./app-terminal-sessions.js?v=20260826.150";
import {
  attachIframeSession,
  attachVmSession,
  attachWorkbenchSession,
  waitForWanixSystem,
} from "./app-sessions.js?v=20260828.154";
import {
  attachWorkspaceTaskSession,
  getWorkspaceTaskSession,
  taskEnvLines,
  wakeWorkspaceTaskSession,
} from "./app-workspace-task-sessions.js?v=20260828.156";
import {
  getDockviewApi,
  rememberOpenPanel,
} from "./app-panels-store.js?v=20260826.150";
import {
  blankTerminalPresetDraft,
  PANEL_CREATION_OPTIONS,
} from "./app-panels.js?v=20260826.151";
import {
  dismissHomeDebugErrors,
  DOCKVIEW_LICENSE_KEY,
  HOME,
  reportHomeError,
  showHomeDebugErrors,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
  W9Y_BINARY_VERSION,
  WANIX,
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_TASK_STATUS_EVENT,
} from "./app-constants.js?v=20260828.109";

// Set the license key before any DockviewComponent is created so the
// watermark never renders; a late setLicenseKey also works (LicenseModule
// subscribes to the registry change and refreshes).
LicenseManager.setLicenseKey(DOCKVIEW_LICENSE_KEY);

const systemWorkspace = loadActiveWorkspace();
// Inject the agent-control binds (shared /gearshell dir + the gear CLI)
// before the namespace is built, so every task sees them this session.
ensureGearShellBinds(systemWorkspace);
// Plugin-declared wasm binaries + preset resources ride the same per-task
// bind path; reconcile before the namespace is built (binds bake in at
// construction). install/enable/disable/remove already reconciled, so
// this is a verify + stale-prune pass on boot.
ensurePluginToolBinds(systemWorkspace, loadConfig().plugins);
// Prime the OPFS bind-content cache (async, fire-and-forget): download
// each enabled plugin's wasm deps once, then task mounts serve from the
// cache. First task boot may race priming and fall back to the origin.
primePluginContentCache(loadConfig().plugins).catch((error) => {
  console.error("plugin cache priming failed", error);
});
// Warm the w9y install registry (opfs/w9y/registry.json) so
// window.GearShell.w9y.list/status answer from memory after boot.
loadW9yRegistry().catch((error) => {
  console.error("w9y registry load failed", error);
});
// NOTE: the dual-mode dependency sync (ensureW9yDependencies) is NOT here
// (pre-runtime, before initPanels) — the apply path needs panelsDep +
// GearShell, so it fires after initWorkspaceApi below.
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
  root.render(html`<${App}/>`);
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
  // Cross-module add*Panel dispatchers: panels.js's PANEL_ADDERS routes
  // every kernel panel through this table; pluginized components (home,
  // settings, files, runtime, playground, workbench, vm, music, deck,
  // group, launcher, crush-runner, ...) fall through to openPluginPanel.
  addLandingPanel,
  addPluginsPanel,
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

// Initialise the plugin kernel (WISHLIST #9) with the shared registry
// maps dockview/launcher resolve panel types against, then load every
// enabled plugin from the shell config (the normalized config merges
// DEFAULT_PLUGINS, so the Music dogfood loads here too). Plugin loads
// are async and individually failure-isolated; boot continues either
// way.
initPlugins({
  PANEL_COMPONENTS,
  PANEL_CREATION_OPTIONS,
  rememberOpenPanel,
  getWanixRoot,
  loadConfig,
  workspaceApi,
  normalizePlugin,
});
// Entry-less iframe plugins (Browser / Bonsai / Codigo / Crush / Rick
// Roll) register synchronously so the boot/restore path can open them
// immediately; component plugins load asynchronously below.
registerSyncPlugins();
getPluginBootPromise();
registerPluginsSettingsSection();

// Initialise the Plugins manager panel (same shape as Playground).
initPluginsPanel({
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
// carries the gear bind.
initWorkspaceApi();

// Dual-mode w9y dependency sync: fire-and-forget `w9y mod apply` for
// plugins declaring w9y deps that are missing or pinned to another
// version. Runs AFTER initPanels/initWorkspaceApi — the apply path goes
// through runHeadlessTask, which calls panelsDep (initPanels) and needs
// window.GearShell alive; earlier (the pre-runtime block above) it would
// throw "panels: initPanels() has not been called" and never install.
// The headless task itself waits for systemReady before waking.
ensureW9yDependencies(loadConfig().plugins, W9Y_BINARY_VERSION).catch((error) => {
  console.error("w9y dependency sync failed", error);
});
