// The dockview shell: App root component + the panel lifecycle
// handlers (split out of app.js so no file exceeds the 500-line
// budget). App.js wires the submodule dependency tables and mounts
// the App; this module only knows how to render the dock and react
// to panel events.

import React, { useCallback } from "react";
import { DockviewReact } from "dockview-react";
import { LandingPanel } from "./home.js?v=20260812.22";
import { DeckPanel } from "./deck.js?v=20260812.29";
import { SettingsPanel } from "./settings.js?v=20260826.16";
import { FilesPanel } from "./files.js?v=20260826.58";
import { RuntimePanel } from "./runtime.js?v=20260826.43";
import { CrushRunnerPanel } from "./crush-runner.js?v=20260826.26";
import {
  addFallbackPanel,
  AddTerminalButton,
  FallbackPanel,
} from "./launcher.js?v=20260812.36";
import {
  GroupPanel,
  IframePanel,
  PanelTab,
  TerminalPanel,
  VmPanel,
  WagiDogPet,
  WorkbenchPanel,
  WorkspaceTaskPanel,
} from "./panels.js?v=20260812.41";
import { setDockviewApi } from "./app-panels-store.js?v=20260826.31";
import { initWidgetBot } from "./widgetbot.js?v=20260829.1";
import {
  destroyTerminalSession,
  hideTerminalLayer,
  restoreTerminalLayer,
} from "./app-terminal-sessions.js?v=20260826.31";
import {
  destroyIframeSession,
  destroyVmSession,
  destroyWorkbenchSession,
} from "./app-sessions.js?v=20260828.35";
import { destroyWorkspaceTaskSession } from "./app-workspace-task-sessions.js?v=20260828.37";
import {
  autoStartWorkspaceTasks,
  restoreSavedPanels,
  whenWanixReady,
} from "./app-panels.js?v=20260826.32";
import {
  loadActiveWorkspace,
  loadConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.31";
import { forgetOpenPanel } from "./app-panels-store.js?v=20260826.31";
import { addPanelByComponent } from "./panels.js?v=20260812.41";
import {
  gcWorkspaceTasks,
  wirePanelEvents,
} from "./workspace-api.js?v=20260828.47";

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
  const restored = cfg.restoreTabs && restoreSavedPanels(api);
  if (!restored) {
    for (const component of cfg.startupPanels) {
      addPanelByComponent(api, component);
    }
  }
  if (api.panels.length === 0) addFallbackPanel(api);
  return restored;
}

// dockview-enterprise features are opt-in options (the module is
// registered by the `import { LicenseManager } from
// "dockview-enterprise"` side-effect import in app.js).
function dockviewOptions(onReady) {
  return {
    className: "dockview-theme-github-dark",
    onReady,
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

const PANEL_COMPONENTS = {
  home: LandingPanel,
  deck: DeckPanel,
  settings: SettingsPanel,
  files: FilesPanel,
  runtime: RuntimePanel,
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
