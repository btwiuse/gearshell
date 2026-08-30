// Files: the Files panel — a tree-view file browser over the Wanix
// filesystem, with a built-in text/image/audio/PDF editor.
//
// This module owns the `files` dockview panel end-to-end: panel state,
// filesystem operations and the sidebar/editor layout. Editor logic,
// sidebar resize, the per-extension icon map and the breadcrumb /
// context-menu UI live in sibling modules (files-editor.js,
// files-resize.js, files-parts.js, files-ui.js) so each file stays
// under the 500-line rule. Panel hooks live in files-panel-hooks.js
// and the UI sections in files-panel-sections.js, so every function
// stays under the 50-line rule.
//
// Dependency-injection shim: app.js calls `initFiles(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `filesDep(name)`. The
// only app.js globals FilesPanel touches directly are the wanix
// system element (so the panel can subscribe to its `ready` event)
// and the wanix filesystem root accessor.

import React, { useCallback, useEffect, useRef } from "react";
import htm from "htm";

import { useFilesEditor } from "./files-editor.js?v=20260826.47";
import { useFilesSelection } from "./files-context-menu.js?v=20260826.47";
import { useFavorites } from "./files-favorites.js?v=20260826.38";
import { useFilesTree } from "./files-tree.js?v=20260826.42";
import { useFilesSidebarResize } from "./files-resize.js?v=20260826.29";
import {
  useFilesMediaLayout,
  useFilesNavigation,
  useFilesOpenEntry,
  useFilesPanelActions,
  useFilesPanelContextMenu,
  useFilesPanelEffects,
  useFilesPanelMounts,
  useFilesPanelState,
  useFilesRefresh,
} from "./files-panel-hooks.js?v=20260826.148";
import {
  FilesPanelContextMenu,
  FilesPanelRightPane,
  FilesPanelSidebar,
  FilesPanelTopbar,
} from "./files-panel-sections.js?v=20260826.53";
import { FilesResizer } from "./files-parts.js?v=20260826.51";
import {
  filesystemPathParent,
  normalizeFilesystemPath,
} from "../files-path.js?v=20260826.71";
import { filesDep } from "./files-registry.js?v=20260826.115";

const html = htm.bind(React.createElement);

// === External open bridge ===
// `GearShell.files.open(path)` (gear open) lands here: while the panel is
// mounted, the handler routes straight to the open flow; a request that
// arrives before mount is queued and drained by the panel's first effect.
let filesOpenHandler = null;
let filesOpenRequest = null;

export function requestFilesOpen(path) {
  const target = normalizeFilesystemPath(path);
  if (filesOpenHandler) {
    filesOpenHandler(target);
    return { queued: false };
  }
  filesOpenRequest = target;
  return { queued: true };
}

// Wire the shared panel state hooks (editor, sidebar resize, favorites,
// refresh) onto the panel object.
function useFilesPanelCore(panel, panelRef) {
  panel.stackedLayout = useFilesMediaLayout().stackedLayout;
  panel.getRoot = useCallback(() => filesDep("getWanixRoot")(), []);
  Object.assign(panel, useFilesEditor(panel.getRoot));
  Object.assign(
    panel,
    useFilesSidebarResize({
      stackedLayout: panel.stackedLayout,
      panelRef,
    }),
  );
  Object.assign(
    panel,
    useFavorites({
      loadConfig: () => filesDep("loadConfig")(),
      saveConfig: (c) => filesDep("saveConfig")(c),
      homePath: filesDep("HOME"),
    }),
  );
  panel.refresh = useFilesRefresh({
    getRoot: panel.getRoot,
    path: panel.path,
    setEntries: panel.setEntries,
    setStatus: panel.setStatus,
    setLoading: panel.setLoading,
  });
}

// Wire navigation / open-entry / context-menu, routing the info-pane
// setter through a ref so navigation can clear it without a declaration
// cycle (setSelectedInfo is created by useFilesSelection below).
function useFilesPanelNavigation(panel, selectedInfoSetterRef) {
  const setSelectedInfoViaRef = (value) =>
    selectedInfoSetterRef.current?.(value);
  Object.assign(
    panel,
    useFilesNavigation({
      path: panel.path,
      setPath: panel.setPath,
      setHighlighted: panel.setHighlighted,
      setEntries: panel.setEntries,
      clearFileSelection: panel.clearFileSelection,
      setSelectedInfo: setSelectedInfoViaRef,
    }),
  );
  panel.openEditorEntry = useFilesOpenEntry({
    openEntry: panel.openEntry,
    navigateTo: panel.navigateTo,
    setSelectedInfo: setSelectedInfoViaRef,
    setStatus: panel.setStatus,
  });
  Object.assign(
    panel,
    useFilesPanelContextMenu({
      getRoot: panel.getRoot,
      setStatus: panel.setStatus,
      path: panel.path,
      openEditorEntry: panel.openEditorEntry,
      navigateTo: panel.navigateTo,
      refresh: panel.refresh,
      clearFileSelection: panel.clearFileSelection,
      selectedPath: panel.selectedPath,
      setCreating: panel.setCreating,
      setEntryName: panel.setEntryName,
      setRenameTarget: panel.setRenameTarget,
    }),
  );
}

// Wire selection, tree, mounts, actions and lifecycle effects; the
// selection hook finally creates setSelectedInfo, so the ref indirection
// above is resolved here.
function useFilesPanelSelection(panel, selectedInfoSetterRef) {
  Object.assign(
    panel,
    useFilesSelection({
      getRoot: panel.getRoot,
      path: panel.path,
      setHighlighted: panel.setHighlighted,
      setContextMenu: panel.setContextMenu,
    }),
  );
  selectedInfoSetterRef.current = panel.setSelectedInfo;
  panel.tree = useFilesTree({ getRoot: panel.getRoot, path: panel.path });
}

// Wire mounts, panel actions and lifecycle effects (split from the
// selection wiring so both stay under the 50-line rule).
function useFilesPanelActionsWire(panel, fileInputRef) {
  Object.assign(
    panel,
    useFilesPanelMounts({
      getKernel: useCallback(() => filesDep("wanixSystem")?._kernel, []),
      getRoot: panel.getRoot,
      path: panel.path,
      setStatus: panel.setStatus,
      navigateTo: panel.navigateTo,
      refresh: panel.refresh,
    }),
  );
  Object.assign(
    panel,
    useFilesPanelActions({
      getRoot: panel.getRoot,
      path: panel.path,
      selectedPath: panel.selectedPath,
      renameTarget: panel.renameTarget,
      creating: panel.creating,
      entryName: panel.entryName,
      setCreating: panel.setCreating,
      setEntryName: panel.setEntryName,
      setSelectedPath: panel.setSelectedPath,
      setPath: panel.setPath,
      setStatus: panel.setStatus,
      refresh: panel.refresh,
      navigateTo: panel.navigateTo,
      openEditorEntry: panel.openEditorEntry,
      saveFile: panel.saveFile,
      removeFile: panel.removeFile,
      fileInputRef,
    }),
  );
  useFilesPanelEffects({
    refresh: panel.refresh,
    restoreMounts: panel.restoreMounts,
    path: panel.path,
    setPathDraft: panel.setPathDraft,
    setHighlighted: panel.setHighlighted,
    setContextMenu: panel.setContextMenu,
  });
}

// Drain the external-open bridge (gear open). No dep array: re-runs each
// render so the closure always sees the freshest panel actions, and the
// cleanup unregisters the handler when the panel unmounts.
function useFilesOpenBridge(panel) {
  useEffect(() => {
    filesOpenHandler = (target) => {
      const dir = filesystemPathParent(target);
      if (panel.path !== dir) panel.navigateTo(dir);
      panel.openEditorEntry({
        name: target.split("/").filter(Boolean).pop() || target,
        isDirectory: false,
      }, dir);
    };
    if (filesOpenRequest) {
      filesOpenHandler(filesOpenRequest);
      filesOpenRequest = null;
    }
    return () => {
      filesOpenHandler = null;
    };
  });
}

function renderFilesPanel(panel, filesPanelRef) {
  return html`
    <div
      ref=${filesPanelRef}
      className="files-panel panel-content"
      style=${{
        "--files-sidebar-width": `${panel.sidebarWidth}px`,
        "--files-sidebar-height": `${panel.sidebarHeight}px`,
      }}
    >
      <${FilesPanelTopbar} panel=${panel}/>
      <${FilesPanelSidebar} panel=${panel}/>
      <${FilesResizer}
        stackedLayout=${panel.stackedLayout}
        sidebarWidth=${panel.sidebarWidth}
        sidebarHeight=${panel.sidebarHeight}
        onResizeStart=${panel.startSidebarResize}
        onResizeMove=${panel.resizeSidebar}
        onResizeStop=${panel.stopSidebarResize}
        onResizeBy=${panel.resizeSidebarBy}
      />
      <${FilesPanelContextMenu} panel=${panel}/>
      <${FilesPanelRightPane} panel=${panel}/>
    </div>
  `;
}

function FilesPanel() {
  const fileInputRef = useRef(null);
  const filesPanelRef = useRef(null);
  const selectedInfoSetterRef = useRef(null);
  const panel = useFilesPanelState();
  useFilesPanelCore(panel, filesPanelRef);
  useFilesPanelNavigation(panel, selectedInfoSetterRef);
  useFilesPanelSelection(panel, selectedInfoSetterRef);
  useFilesPanelActionsWire(panel, fileInputRef);
  useFilesOpenBridge(panel);
  panel.displayPath = panel.selectedPath || panel.selectedInfo?.path ||
    panel.path;
  return renderFilesPanel(panel, filesPanelRef);
}

export { FilesPanel };
