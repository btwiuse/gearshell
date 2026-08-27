// files-panel-sections.js — the Files panel's UI sections (topbar, sidebar
// with tree, context menu, right pane), split out of files.js so every
// function stays under the 50-line rule and every file under the 500-line
// rule. Each section is a thin wrapper that wires the shared `panel` bag
// (state + callbacks assembled by FilesPanel) into the presentational
// sibling module.

import React from "react";

import {
  FilesResizer,
  FilesRightPane,
  FilesSidebar,
} from "./files-parts.js?v=20260826.40";
import { FilesContextMenu } from "./files-context-menu-ui.js?v=20260826.38";
import {
  filesystemPathJoin,
  filesystemPathParent,
} from "./files-path.js?v=20260826.38";
import { FilesTopbar } from "./files-topbar.js?v=20260826.39";
import { FilesTree } from "./files-tree.js?v=20260826.38";

function FilesPanelTopbar({ panel }) {
  const {
    path,
    displayPath,
    pathDraft,
    loading,
    setPathDraft,
    navigateTo,
    navigateToPath,
    refresh,
    fileInputRef,
    setCreating,
    setEntryName,
    removeDirectory,
  } = panel;
  return React.createElement(FilesTopbar, {
    path,
    displayPath,
    pathDraft,
    loading,
    onPathDraftChange: setPathDraft,
    // Sync the draft from the breadcrumb's display path when entering edit
    // mode: the breadcrumb may show the selected entry's path (e.g.
    // /opfs/home) while `path` (and the stale draft) still point at the
    // current directory (/opfs).
    onStartEdit: () => {
      const target = displayPath;
      setPathDraft(target === "." ? "/" : `/${target.replace(/^\/+/, "")}`);
    },
    onNavigate: navigateToPath,
    onBreadcrumbNavigate: navigateTo,
    onParent: () => navigateTo(filesystemPathParent(path)),
    onRefresh: refresh,
    onUpload: () => fileInputRef.current?.click(),
    onNewFile: () => {
      setCreating("file");
      setEntryName("");
    },
    onNewFolder: () => {
      setCreating("folder");
      setEntryName("");
    },
    onRenameFolder: () => {
      setCreating("rename-folder");
      setEntryName(path.split("/").pop() || "");
    },
    onDeleteFolder: removeDirectory,
  });
}

function FilesPanelTree({ panel }) {
  const {
    tree,
    path,
    highlighted,
    finePointer,
    clearFileSelection,
    selectEntry,
    openEditorEntry,
    setContextMenu,
  } = panel;
  return React.createElement(FilesTree, {
    tree,
    path,
    selectedPath: highlighted,
    finePointer,
    onToggle: tree.toggleDir,
    onSelect: (entry) => {
      // Selecting a file shows its preview, closing any open editor.
      clearFileSelection();
      selectEntry(entry, filesystemPathParent(entry.path));
    },
    onOpen: (entry) => openEditorEntry(entry, filesystemPathParent(entry.path)),
    onContextMenu: finePointer
      ? (entry, x, y) => {
        setContextMenu({
          x: Math.max(4, Math.min(x, window.innerWidth - 180)),
          y: Math.max(4, Math.min(y, window.innerHeight - 220)),
          entry: { ...entry, path: entry.path },
        });
      }
      : null,
  });
}

function FilesPanelSidebar({ panel }) {
  const {
    favorites,
    path,
    navigateTo,
    openEditorEntry,
    removeFavorite,
    mounts,
    handleMountLocalDir,
    openMount,
    unmountLocalDir,
    fileInputRef,
    creating,
    entryName,
    setCreating,
    setEntryName,
    createEntry,
    uploadFiles,
    sidebarCollapsed,
    setSidebarCollapsed,
    tree,
    highlighted,
    finePointer,
    clearFileSelection,
    selectEntry,
    setContextMenu,
  } = panel;
  return React.createElement(
    FilesSidebar,
    {
      favorites,
      currentPath: path,
      onOpen: (favorite) => {
        if (favorite.isDirectory === false) {
          openEditorEntry(
            {
              name: String(favorite.path).split("/").pop(),
              isDirectory: false,
            },
            filesystemPathParent(favorite.path),
          );
        } else {
          navigateTo(favorite.path);
        }
      },
      onRemove: removeFavorite,
      mounts,
      onMount: handleMountLocalDir,
      onOpenMount: openMount,
      onUnmount: unmountLocalDir,
      fileInputRef,
      creating,
      entryName,
      onEntryNameChange: setEntryName,
      onCreate: createEntry,
      onCancel: () => setCreating(null),
      onUpload: uploadFiles,
      collapsedSections: sidebarCollapsed,
      onToggleSection: (name) =>
        setSidebarCollapsed((prev) => ({ ...prev, [name]: !prev[name] })),
    },
    React.createElement(FilesPanelTree, { panel }),
  );
}

function FilesPanelContextMenu({ panel }) {
  const {
    contextMenu,
    menuRef,
    openEntryFromMenu,
    createInFolder,
    downloadEntry,
    startRenameEntry,
    deleteEntry,
    addFavorite,
    setContextMenu,
    isFavoritePath,
  } = panel;
  return React.createElement(FilesContextMenu, {
    menu: contextMenu,
    menuRef,
    onOpen: openEntryFromMenu,
    onNewFile: (entry) => createInFolder(entry, "file"),
    onNewFolder: (entry) => createInFolder(entry, "folder"),
    onDownload: downloadEntry,
    onRename: startRenameEntry,
    onDelete: deleteEntry,
    onAddFavorite: (entry) => {
      addFavorite(entry);
      setContextMenu(null);
    },
    isFavorite: contextMenu ? isFavoritePath(contextMenu.entry.path) : false,
  });
}

function FilesPanelRightPane({ panel }) {
  const {
    selectedPath,
    preview,
    contents,
    binary,
    dirty,
    selectedInfo,
    entries,
    loading,
    status,
    viewMode,
    setViewMode,
    sort,
    setSort,
    columnWidths,
    setColumnWidths,
    path,
    downloadFile,
    saveFileHandler,
    setCreating,
    setEntryName,
    removeFileHandler,
    setContents,
    finePointer,
    setHighlighted,
    openEditorEntry,
  } = panel;
  return React.createElement(FilesRightPane, {
    selectedPath,
    preview,
    contents,
    binary,
    dirty,
    info: selectedInfo,
    entries,
    loading,
    status,
    viewMode,
    onViewModeChange: setViewMode,
    sort,
    onSortChange: setSort,
    columnWidths,
    onColumnWidthChange: setColumnWidths,
    currentPath: path,
    onDownload: downloadFile,
    onSave: saveFileHandler,
    onRename: () => {
      setCreating("rename-file");
      setEntryName(selectedPath.split("/").pop() || "");
    },
    onDelete: removeFileHandler,
    onChange: setContents,
    // Single click selects in-place (the pane highlights the tile and shows
    // its details in the footer; the tree highlight mirrors it), double
    // click opens: directories enter, files open in the editor. On touch
    // the grid follows the tree and opens on a single tap.
    finePointer,
    onSelectChild: (child) => {
      const base = (selectedInfo && selectedInfo.path) || path;
      setHighlighted(filesystemPathJoin(base, child.name));
    },
    onOpenChild: (child) => {
      const base = (selectedInfo && selectedInfo.path) || path;
      openEditorEntry(child, base);
    },
  });
}

export {
  FilesPanelContextMenu,
  FilesPanelRightPane,
  FilesPanelSidebar,
  FilesPanelTopbar,
};
