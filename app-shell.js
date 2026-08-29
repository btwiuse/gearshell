// The dockview shell: App root component + the panel lifecycle
// handlers (split out of app.js so no file exceeds the 500-line
// budget). App.js wires the submodule dependency tables and mounts
// the App; this module only knows how to render the dock and react
// to panel events.

import React, { useCallback } from "react";
import { DockviewReact } from "dockview-react";
import { LandingPanel } from "./home.js?v=20260812.24";
import { SettingsPanel } from "./settings.js?v=20260826.57";
import { FilesPanel } from "./files.js?v=20260826.73";
import { RuntimePanel } from "./runtime.js?v=20260826.44";
import { PlaygroundPanel } from "./playground-panel.js?v=20260829.26";
import { CrushRunnerPanel } from "./crush-runner.js?v=20260826.59";
import {
  addFallbackPanel,
  AddTerminalButton,
  FallbackPanel,
} from "./launcher.js?v=20260812.39";
import {
  GroupPanel,
  IframePanel,
  PanelTab,
  TerminalPanel,
  VmPanel,
  WagiDogPet,
  WorkbenchPanel,
  WorkspaceTaskPanel,
} from "./panels.js?v=20260812.52";
import {
  forgetOpenPanel,
  rememberOpenPanel,
  setDockviewApi,
} from "./app-panels-store.js?v=20260826.64";
import { nextPanelIndex } from "./app-panel-ids.js?v=20260828.76";
import { initWidgetBot } from "./widgetbot.js?v=20260829.1";
import {
  destroyTerminalSession,
  hideTerminalLayer,
  restoreTerminalLayer,
} from "./app-terminal-sessions.js?v=20260826.64";
import {
  destroyIframeSession,
  destroyVmSession,
  destroyWorkbenchSession,
} from "./app-sessions.js?v=20260828.68";
import { destroyWorkspaceTaskSession } from "./app-workspace-task-sessions.js?v=20260828.70";
import {
  autoStartWorkspaceTasks,
  restoreSavedPanels,
  whenWanixReady,
} from "./app-panels.js?v=20260826.65";
import {
  loadActiveWorkspace,
  loadConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.64";
import { addPanelByComponent } from "./panels.js?v=20260812.52";
import {
  restoreSavedLayout,
  wireLayoutPersistence,
} from "./app-layout.js?v=20260828.93";
import {
  gcWorkspaceTasks,
  wirePanelEvents,
} from "./workspace-api.js?v=20260828.80";

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
  // Prune finished agent-managed task definitions before anything can
  // restore or respawn them (ephemeral agent tasks were never stored).
  gcWorkspaceTasks();
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
  if (api.panels.length === 0) addFallbackPanel(api);
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
  "fallback",
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

function tabContextMenuItems({ panel, api }) {
  const items = [];
  if (DUPLICATABLE_PANEL_TYPES.has(panelTypeOf(panel))) {
    items.push({
      label: "Duplicate",
      action: () => duplicatePanel(api, panel),
    });
    items.push("separator");
  }
  items.push("close", "closeOthers", "closeAll");
  return items;
}

// dockview-enterprise features are opt-in options (the module is
// registered by the `import { LicenseManager } from
// "dockview-enterprise"` side-effect import in app.js).
function dockviewOptions(onReady) {
  return {
    className: "dockview-theme-github-dark",
    onReady,
    // Tab right-click menu: the built-in Pin item is auto-prepended by
    // the ContextMenu module; this supplies Duplicate (content panels
    // only) plus the close family.
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
  home: LandingPanel,
  settings: SettingsPanel,
  files: FilesPanel,
  runtime: RuntimePanel,
  playground: PlaygroundPanel,
  workbench: WorkbenchPanel,
  vm: VmPanel,
  fallback: FallbackPanel,
  task: WorkspaceTaskPanel,
  terminal: TerminalPanel,
  group: GroupPanel,
  iframe: IframePanel,
  "crush-runner": CrushRunnerPanel, // from ./crush-runner.js
};

function App() {
  const onReady = useCallback((event) => {
    setDockviewApi(event.api);
    initWidgetBot(loadConfig().widgetbot);
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);
    event.api.onDidRemovePanel((panel) => handlePanelRemoved(event.api, panel));
    // Mirror panel lifecycle into the agent event ring buffer.
    wirePanelEvents(event.api);
    // Persist the full dockview layout (groups, sizes, pinned tabs) so a
    // reload with Restore tabs brings the exact arrangement back.
    wireLayoutPersistence(event.api);
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
    React.createElement(DockviewReact, dockviewOptions(onReady)),
    React.createElement(WagiDogPet),
  );
}

export { App, handlePanelRemoved, trackActivePanel };
