import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { createRoot } from "react-dom/client";

// Side-effect import: registers all enterprise modules (incl. the license
// gate) onto the shared `dockview` instance (importmap resolves both
// packages to the same module URL). Kept deliberately, do not remove.
import { LicenseManager } from "dockview-enterprise";

import { addLandingPanel, initHome } from "./plugin/home/home.js";
import { ensureCrushRunnerBuiltinsKv } from "./plugin/crush-playground/preset-api.js";
import { initSettings } from "./plugin/settings/settings-deps.js";
import { TerminalPresetIconPicker } from "./plugin/settings/settings-icons.js";

import { initFiles } from "./plugin/files/files-registry.js";
import { initRuntime } from "./plugin/runtime/runtime.js";
import {
  getPluginBootPromise,
  initPlugins,
  registerSyncPlugins,
} from "./plugins.js";
import { initLauncher } from "./plugin/launcher/launcher.js";
import {
  addPanelByComponent as addPanelByComponentFromPanels,
  addTerminalPanel as addTerminalPanelFromPanels,
  addWorkspaceTaskPanel as addWorkspaceTaskPanelFromPanels,
  initPanels,
} from "./panels.js";
import {
  ensureGearShellBinds,
  initWorkspaceApi,
  workspaceApi,
} from "./workspace-api.js";
import { initIframePluginApi } from "./plugins-iframe-api.js";
import { startIframeKeyForwarder } from "./app-iframe-key-forwarder.js";
import { initHotkeys, registerHotkey } from "./app-hotkeys.js";
import { toggleOverlay } from "./app-overlay-toggle.js";
import {
  ensurePluginSystemFiles,
  ensurePluginToolBinds,
} from "./app-plugin-binds.js";
import { primePluginContentCache } from "./app-plugin-cache.js";
import { loadW9yRegistry, ensureW9yDependencies, applyW9yMod } from "./app-w9y-registry.js";
import {
  clearAuditEntries,
  listAuditEntries,
  undoAuditEntry,
} from "./workspace-audit.js";
import { App, PANEL_COMPONENTS } from "./app-shell.js";

import {
  getWanixRoot,
  setSystemReady,
  setTerminalLayer,
  setWanixSystem,
  systemReady,
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js";
import { createWanixSystem } from "./app-wanix.js";
import { resolveWanixRuntime } from "./app-normalize-runtime.js";
import {
  addWorkspaceBind,
  addWorkspaceSystemBind,
  addWorkspaceTask,
  createWorkspaceFromPreset,
  deleteWorkspace,
  duplicateWorkspace,
  ensureWorkspaceStore,
  getActiveWorkspaceId,
  importWorkspace,
  loadActiveWorkspace,
  loadConfig,
  loadWorkspace,
  makeBindItemDraggable,
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
  saveWorkspaceSystemSettings,
  setActiveWorkspaceId,
  setWagiDogEnabled,
  updateWorkspaceBind,
  updateWorkspaceSystemBind,
  updateWorkspaceTask,
} from "./app-workspace.js";
import {
  listWorkspacePresets,
  loadCustomWorkspacePreset,
  removeCustomWorkspacePreset,
  saveCustomWorkspacePreset,
  uniqueWorkspacePresetName,
} from "./app-workspace-presets.js";
import {
  clone,
  getTerminalPresetIcon,
  normalizeLauncherOrder,
  normalizePlugin,
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
} from "./app-normalize.js";
import {
  buildEnv,
  getDefaultTerminalProfile,
  getTerminalProfiles,
  getWorkbenchPanelConfig,
  saveTerminalProfiles,
  terminalCommand,
} from "./app-terminal-profiles.js";
import {
  attachOverlayTerminalSession,
  attachTerminalSession,
  createTerminalSession,
  destroyTerminalSession,
  wakeTerminalSession,
} from "./app-terminal-sessions.js";
import {
  attachIframeSession,
  attachWorkbenchSession,
  waitForWanixSystem,
} from "./app-sessions.js";
import {
  attachWorkspaceTaskSession,
  getWorkspaceTaskSession,
  taskEnvLines,
  wakeWorkspaceTaskSession,
} from "./app-workspace-task-sessions.js";
import {
  getDockviewApi,
  rememberOpenPanel,
} from "./app-panels-store.js";
import {
  blankTerminalPresetDraft,
  PANEL_CREATION_OPTIONS,
} from "./app-panels.js";
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
} from "./app-constants.js";

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
// systemFiles (e.g. the js-worker examples) mount into the system root
// namespace, which the kernel's js driver reads scripts from.
ensurePluginSystemFiles(systemWorkspace, loadConfig().plugins);
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
// Resolve the runtime pair first so a stale workspace pin falls back to the
// packaged default; then load the module (this import is the boot gate) and
// build the system with the same pair the module resolved to.
const effectiveRuntime = await resolveWanixRuntime(systemWorkspace.runtime);
await import(effectiveRuntime.moduleUrl);
const wanixSystem = createWanixSystem(systemWorkspace, effectiveRuntime);
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
  getWorkbenchPanelConfig,
  getDefaultTerminalProfile,
  // Cross-module add*Panel dispatchers so panels.js can route every
  // Cross-module add*Panel dispatchers: panels.js's PANEL_ADDERS routes
  // every kernel panel through this table; pluginized components (home,
  // settings, files, runtime, playground, workbench, vm, music, deck,
  // group, launcher, crush-runner, ...) fall through to openPluginPanel.
  addLandingPanel,
  // Lazy w9y install trigger for iframe plugins: ensureW9yDependencies
  // skips iframe plugins on boot, so addIframePanel calls this with the
  // manifest's `w9y: { mod, version? }` on first open. Routed through
  // the dep shim so panels.js does not directly import
  // app-w9y-registry.js (which would loop through workspace-tasks-api
  // -> panels.js).
  triggerPluginW9yInstall: (w9y) => applyW9yMod(w9y.mod, w9y.version || null),
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
// immediately; component plugins load asynchronously below. The
// App Store replaces the old in-page Plugins manager — install /
// enable / remove flows live behind panels.open("app-store"), and
// the Settings > Apps card just opens that panel.
registerSyncPlugins();
getPluginBootPromise();

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

// Initialise the Workspace API: expose window.GearShell to agents (via
// the kernel's jsfs /js projection) and ensure the active workspace
// carries the gear bind.
initWorkspaceApi();
// Seed the Crush Playground built-in presets into the per-workspace
// KV store once per workspace, so the iframe plugin can read them
// through `config.kv.get("crush-playground:builtins")` like any
// other JSON value.
ensureCrushRunnerBuiltinsKv();
initHotkeys((action) => {
  if (action.method === "panels.open") {
    workspaceApi.panels.open(...action.args);
    return;
  }
  if (action.method === "overlay.toggle") {
    toggleOverlay(...action.args);
  }
});
// ctrl+shift+p opens the Spotlight overlay since the launcher panel
// plugin is disabled by default.
registerHotkey({
  id: "core:launcher",
  key: "ctrl+shift+p",
  action: { method: "overlay.toggle", args: ["spotlight"] },
});

// Wire the iframe plugin bridge; must run after initWorkspaceApi.
initIframePluginApi();
// Forward keydowns fired inside iframe plugin panels back to the
// shell window so Spotlight and other host-level hotkeys keep
// working while focus is in Browser / Bonsai / glmatrix / etc.
startIframeKeyForwarder();

// Pre-warm the chime AudioContext for in-page terminals so the first
// agent-done chime of this session needs no fresh user gesture.
// Iframe plugin pages run terminal-mount.mjs in their own document
// and pre-warm independently.
// (No host pre-warm: terminal-mount.mjs creates the AudioContext on
// its first mountTerminal call, which already runs inside the user's
// Launch gesture stack — earlier init would just trip Chrome's
// autoplay warning.)

// Dual-mode w9y dep sync: fire-and-forget `w9y mod apply`. Must run
// after initPanels/initWorkspaceApi (the apply path needs both).
ensureW9yDependencies(loadConfig().plugins, W9Y_BINARY_VERSION).catch((error) => {
  console.error("w9y dependency sync failed", error);
});
