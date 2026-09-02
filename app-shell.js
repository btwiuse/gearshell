// The dockview shell: App root component + the panel lifecycle
// handlers (split out of app.js so no file exceeds the 500-line
// budget). App.js wires the submodule dependency tables and mounts
// the App; this module only knows how to render the dock and react
// to panel events.

import React, { useCallback, useEffect, useState } from "react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { DockviewReact } from "dockview-react";
import { PluginsPanel } from "./plugins-panel.js";
import { AddTerminalButton } from "./plugin/launcher/launcher.js";
import {
  IframePanel,
  PanelTab,
  TerminalPanel,
  WorkspaceTaskPanel,
} from "./panels.js";
import {
  forgetOpenPanel,
  rememberOpenPanel,
  setDockviewApi,
} from "./app-panels-store.js";
import { nextPanelIndex } from "./app-panel-ids.js";
import {
  getPluginBootPromise,
  getEmptyGridPanel,
  listOverlays,
  PLUGIN_CHANGED_EVENT,
} from "./plugins.js";
import {
  destroyTerminalSession,
  hideTerminalLayer,
  restoreTerminalLayer,
} from "./app-terminal-sessions.js";
import {
  destroyIframeSession,
  destroyVmSession,
  destroyWorkbenchSession,
} from "./app-sessions.js";
import { destroyWorkspaceTaskSession } from "./app-workspace-task-sessions.js";
import {
  autoStartWorkspaceTasks,
  restoreSavedPanels,
  whenWanixReady,
} from "./app-panels.js";
import {
  loadActiveWorkspace,
  loadConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js";
import { addPanelByComponent } from "./panels.js";
import {
  restoreSavedLayout,
  wireLayoutPersistence,
} from "./app-layout.js";
import {
  gcWorkspaceTasks,
  wirePanelEvents,
} from "./workspace-api.js";

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
  // Empty-workspace fallback: when the user closes the last panel,
  // wait one frame for dockview to finish tearing the tab down, then
  // re-open the empty-grid provider so the grid is never stranded
  // empty. Deferred so `api.panels.length` reflects the post-removal
  // state at read time.
  requestAnimationFrame(() => {
    if (api.panels.length === 0) openEmptyGridFallback(api);
  });
}

// Empty-workspace fallback: open the first plugin panel that opted
// in via `registerPanel({ emptyGrid: true })` (default-page by default;
// launcher if the user re-enables it). Skipped silently when no
// plugin provides one, so a user who disables both defaults sees an
// empty grid instead of a stale landing page.
function openEmptyGridFallback(api) {
  const provider = getEmptyGridPanel();
  if (!provider) return null;
  if (provider.open) return provider.open(api);
  return addPanelByComponent(api, provider.component);
}

function trackActivePanel(api) {
  // Remember which panel is active so a future reload with Restore tabs can
  // reactivate the same tab instead of always landing on the last-added one.
  api.onDidActivePanelChange((activeEvent) => {
    if (!activeEvent.panel) return;
    const idx = api.panels.findIndex((p) => p.id === activeEvent.panel.id);
    if (idx < 0) return;
    if (activeEvent.panel.params?.panelType === "launcher") {
      window.dispatchEvent(new Event("GearShellPanelFocused"));
    }
    const workspace = loadActiveWorkspace();
    if (workspace.ui?.activeOpenPanelIndex === idx) return;
    workspace.ui = { ...workspace.ui, activeOpenPanelIndex: idx };
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  });
}

async function openStartupPanels(api) {
  // Prune finished agent-managed task definitions before anything can
  // restore or respawn them (ephemeral agent tasks were never stored).
  gcWorkspaceTasks();
  // Startup / restored components may be pluginized (home, runtime,
  // music, ...): wait for their async registration so dockview never
  // receives an unregistered component name (which crashes the grid).
  await getPluginBootPromise();
  const cfg = loadConfig();
  // Prefer the full dockview layout snapshot (group tree, split sizes,
  // pinned tabs); fall back to the legacy panel-by-panel restore for
  // workspaces saved before layouts existed.
  const restored = cfg.restoreTabs &&
    (restoreSavedLayout(api) || restoreSavedPanels(api));
  if (!restored) {
    for (const component of cfg.startupPanels) {
      addPanelByComponent(api, component);
    }
  }
  if (api.panels.length === 0) openEmptyGridFallback(api);
  return restored;
}

// Panels that hold no session state are safe to duplicate from the tab
// context menu (the copy lands right after the source tab, in the same
// group). Session-bearing panels (terminal / vm / workbench / task /
// crush-runner / iframe) bind to ids that must stay unique, so they
// stay single-instance.
const DUPLICATABLE_PANEL_TYPES = new Set([
  "home",
  "deck",
  "settings",
  "files",
  "runtime",
  "music",
  "playground",
  "plugins",
  "launcher",
]);


function panelTypeOf(panel) {
  return panel.params?.panelType || panel.id.replace(/-\d+$/, "");
}

// Duplicate a content panel right next to its source tab and remember it
// so layout persistence keeps the copy across reloads.
export function duplicatePanel(api, panel) {
  const type = panelTypeOf(panel);
  if (!DUPLICATABLE_PANEL_TYPES.has(type)) return null;
  const n = nextPanelIndex(type);
  const id = `${type}-${n}`;
  const params = { ...(panel.params || {}) };
  for (const key of Object.keys(params)) {
    if (key.endsWith("Id")) params[key] = n;
  }
  params.panelType = type;
  const sourceIndex = panel.group?.panels?.indexOf(panel) ?? -1;
  const dup = api.addPanel({
    id,
    component: type,
    params,
    ...(panel.title ? { title: `${panel.title}` } : {}),
    position: {
      referencePanel: panel.id,
      direction: "within",
      ...(sourceIndex >= 0 ? { index: sourceIndex + 1 } : {}),
    },
  });
  rememberOpenPanel(dup, { component: type });
  dup.api.setActive();
  return dup;
}

// Rebuild a session-bearing panel in place: spawn a same-type panel
// right after the source tab carrying the original params, then close
// the source. dockview's onDidRemovePanel → handlePanelRemoved takes
// care of tearing down the old session (wanix-term / iframe / workbench
// / vm / task / crush-runner), and the new panel's mount effect attaches
// a fresh session from the same params — exactly what a user means by
// "reload this tab".
//
// The new panel is created BEFORE the old one closes so the same group
// never empties (otherwise the empty-grid fallback could fire).
// The new panel gets a fresh id suffix via nextPanelIndex; we
// re-register its openPanel snapshot so workspace.ui.openPanels tracks
// the new id, and the full layout save (wireLayoutPersistence) picks up
// the position via onDidLayoutChange.
export function reloadPanel(api, panel) {
  const type = panelTypeOf(panel);
  const n = nextPanelIndex(type);
  const params = { ...(panel.params || {}) };
  // Refresh any *Id params to the new session id the same way
  // duplicatePanel does, so the new React subtree binds to its own
  // session and we don't leak the old session into the new mount.
  for (const key of Object.keys(params)) {
    if (key.endsWith("Id")) params[key] = n;
  }
  params.panelType = type;
  const sourceIndex = panel.group?.panels?.indexOf(panel) ?? -1;
  const replacement = api.addPanel({
    id: `${type}-${n}`,
    component: type,
    params,
    ...(panel.title ? { title: panel.title } : {}),
    position: {
      referencePanel: panel.id,
      direction: "within",
      ...(sourceIndex >= 0 ? { index: sourceIndex + 1 } : {}),
    },
  });
  // Re-register the openPanel snapshot for the new id so the workspace
  // restore path can re-open it. The old id is dropped naturally by
  // handlePanelRemoved (via forgetOpenPanel).
  rememberOpenPanel(replacement, { component: type });
  replacement.api.setActive();
  panel.api.close();
  return replacement;
}

// Reload every session-bearing panel currently open. Useful when a
// workspace-wide state change (wanix restart, iframe plugin update)
// means the user wants a clean slate without hunting tabs. Skips
// non-reloadable content panels for the same reason as reloadPanel.
export function reloadAllPanels(api) {
  // Snapshot the list before iterating — reloadPanel closes the source
  // panel, which mutates api.panels and would shift indices if we
  // walked it live.
  const panels = [...api.panels];
  for (const panel of panels) reloadPanel(api, panel);
  return panels.length;
}

function tabContextMenuItems({ panel, api }) {
  const items = [];
  const type = panelTypeOf(panel);
  // Every panel gets both Duplicate and Reload so the right-click menu
  // is stable across the whole grid. Session-bearing panels (terminal /
  // vm / workbench / task / crush-runner / iframe) get a real "refresh":
  // closing the source tab fires handlePanelRemoved which destroys the
  // wanix-term / iframe / workbench / vm / task session, and the new
  // panel's mount effect attaches a fresh one. Content-only panels
  // (home / settings / files / runtime / music / playground / plugins /
  // launcher) won't visibly change — React diffs the new tree against
  // the old and reuses every DOM node — but the menu item is still
  // there for muscle memory.
  if (DUPLICATABLE_PANEL_TYPES.has(type)) {
    items.push({
      label: "Duplicate",
      action: () => duplicatePanel(api, panel),
    });
  }
  items.push({
    label: "Reload",
    action: () => reloadPanel(api, panel),
  });
  items.push("separator", "close", "closeOthers", "closeAll");
  return items;
}

// dockview-enterprise features are opt-in options (the module is
// "dockview-enterprise"` side-effect import in app.js).
function dockviewOptions(onReady) {
  return {
    className: "dockview-theme-github-dark",
    onReady,
    // Tab right-click menu: the built-in Pin item is auto-prepended by
    // the ContextMenu module; this supplies Duplicate + Reload (both
    // available on every panel — see tabContextMenuItems) plus the
    // close family.
    getTabContextMenuItems: tabContextMenuItems,
    // 固定标签: 独立第二行 + VS Code 式跨边界拖拽翻转
    pinnedTabs: {
      enabled: true,
      mode: "separate-row",
      togglePinOnCrossBoundaryDrag: true,
    },
    // 多行标签: 溢出时换行成第二行 (与 show 模式二选一; show 是弹出层带搜索)
    overflow: { mode: "wrap" },
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
    components: PANEL_COMPONENTS,
    defaultTabComponent: PanelTab,
    rightHeaderActionsComponent: AddTerminalButton,
  };
}

// Exported so the plugin kernel (app.js -> initPlugins) can register
// runtime panel types by mutating the same map dockview resolves
// component names against (dockview reads components[name] at addPanel
// time — no snapshot — so in-place registration works).
export const PANEL_COMPONENTS = {
  plugins: PluginsPanel,
  task: WorkspaceTaskPanel,
  terminal: TerminalPanel,
  console: TerminalPanel,
  iframe: IframePanel,
};

function App() {
  const onReady = useCallback(async (event) => {
    setDockviewApi(event.api);
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);
    event.api.onDidRemovePanel((panel) => handlePanelRemoved(event.api, panel));
    // Mirror panel lifecycle into the agent event ring buffer.
    wirePanelEvents(event.api);
    // Persist the full dockview layout (groups, sizes, pinned tabs) so a
    // reload with Restore tabs brings the exact arrangement back.
    wireLayoutPersistence(event.api);
    const restored = await openStartupPanels(event.api);
    trackActivePanel(event.api);
    // Start configured processes only after Wanix is ready so they follow the
    // same allocation path as tasks opened from Settings. Restored task tabs
    // already represent the prior session, so do not create duplicates.
    whenWanixReady(() => {
      if (!restored) autoStartWorkspaceTasks(event.api);
    });
  }, []);

  return html`
    <${React.Fragment}>
      <${DockviewReact} ...${dockviewOptions(onReady)}/>
      <${PluginOverlays}/>
    </${React.Fragment}>
  `;
}

// Ambient shell chrome from plugins (Wagi Dog pet, Discord widget, or
// anything a third party registers via ctx.registerOverlay). Renders
// nothing itself; re-renders when the kernel changes so async plugin
// loads mount their overlays.
function PluginOverlays() {
  const [, bump] = useState(0);
  useEffect(() => {
    const onPluginsChanged = () => bump((value) => value + 1);
    window.addEventListener(PLUGIN_CHANGED_EVENT, onPluginsChanged);
    return () => {
      window.removeEventListener(PLUGIN_CHANGED_EVENT, onPluginsChanged);
    };
  }, []);
  return html`
    <${React.Fragment}>
      ${listOverlays().map(({ id, render, props }) =>
        html`<${render} key=${id} ...${props || {}}/>`,
      )}
    </${React.Fragment}>
  `;
}

export { App, handlePanelRemoved, trackActivePanel };
