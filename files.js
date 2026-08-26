// Files: the Files panel — a tree-view file browser over the Wanix
// filesystem, with a built-in text/image/audio/PDF editor.
//
// This module owns the `files` dockview panel end-to-end: panel state,
// filesystem operations and the sidebar/editor layout. Editor logic,
// sidebar resize, the per-extension icon map and the breadcrumb /
// context-menu UI live in sibling modules (files-editor.js,
// files-resize.js, files-parts.js, files-ui.js) so each file stays
// under the 500-line rule.
//
// Dependency-injection shim: app.js calls `initFiles(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `filesDep(name)`. The
// only app.js globals FilesPanel touches directly are the wanix
// system element (so the panel can subscribe to its `ready` event)
// and the wanix filesystem root accessor.

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  useLocalDirMounts,
  VolumesSidebar,
} from "./files-mounts.js?v=20260826.38";
import {
  FilesResizer,
  FilesRightPane,
  FilesSidebar,
} from "./files-parts.js?v=20260826.39";
import {
  enrichEntryStats,
  filesystemPathJoin,
  filesystemPathParent,
  normalizeFilesystemPath,
} from "./files-path.js?v=20260826.38";
import { FilesContextMenu } from "./files-context-menu-ui.js?v=20260826.38";
import { FavoritesSidebar } from "./files-favorites-ui.js?v=20260826.38";
import { FilesTopbar } from "./files-topbar.js?v=20260826.38";
import {
  sniffWasmBytes,
  useFilesActions,
  useFilesEditor,
} from "./files-editor.js?v=20260826.26";
import { useFilesSidebarResize } from "./files-resize.js?v=20260826.26";
import {
  useFilesContextMenu,
  useFilesSelection,
} from "./files-context-menu.js?v=20260826.36";
import { useFavorites } from "./files-favorites.js?v=20260826.36";
import { FilesTree, useFilesTree } from "./files-tree.js?v=20260826.38";
import { filesDep } from "./files-registry.js?v=20260826.9";

function FilesPanel() {
  const fileInputRef = useRef(null);
  const filesPanelRef = useRef(null);
  const [path, setPath] = useState(".");
  const [pathDraft, setPathDraft] = useState("/");
  const [entries, setEntries] = useState([]);
  const [highlighted, setHighlighted] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [creating, setCreating] = useState(null);
  const [entryName, setEntryName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [sort, setSort] = useState({ by: "name", desc: false });
  const [columnWidths, setColumnWidths] = useState({ size: 80, mtime: 164 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState({
    explorer: false,
    favorites: false,
    volumes: false,
  });
  const [stackedLayout, setStackedLayout] = useState(() =>
    window.matchMedia("(max-width: 560px)").matches
  );
  const [finePointer] = useState(() =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );

  const getRoot = useCallback(() => filesDep("getWanixRoot")(), []);
  const {
    selectedPath,
    contents,
    preview,
    binary,
    dirty,
    clearFileSelection,
    openEntry,
    saveFile,
    removeFile,
    downloadFile,
    setContents,
    setSelectedPath,
  } = useFilesEditor(getRoot);

  const {
    sidebarWidth,
    sidebarHeight,
    startSidebarResize,
    resizeSidebar,
    stopSidebarResize,
    resizeSidebarBy,
  } = useFilesSidebarResize({ stackedLayout, panelRef: filesPanelRef });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const updateLayout = () => setStackedLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const navigateTo = (nextPath) => {
    // Canonicalize first: favorites and volumes pass absolute paths
    // ("/tmp/d29"), while tree/breadcrumb use relative ones ("tmp/d29").
    // Storing the raw value left a leading slash that never matched the
    // tree's normalized node paths, so the current node lost its
    // highlight. Re-clicking the folder you are already in is a no-op
    // (favorites, volumes, breadcrumb): keep the right-pane preview
    // instead of re-navigating and flashing "Empty folder." while it
    // reloads.
    const target = normalizeFilesystemPath(nextPath);
    if (target === normalizeFilesystemPath(path)) return;
    setPath(target);
    clearFileSelection();
    setHighlighted(null);
    setSelectedInfo(null);
    // Drop the previous listing so the right-pane grid cannot flash
    // stale entries while the new directory is loading.
    setEntries([]);
  };

  const { favorites, addFavorite, removeFavorite, isFavoritePath } =
    useFavorites({
      loadConfig: () => filesDep("loadConfig")(),
      saveConfig: (config) => filesDep("saveConfig")(config),
      homePath: filesDep("HOME"),
    });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const names = await getRoot().readDir(path);
      const next = (Array.isArray(names) ? names : []).map((entry) => {
        const isDirectory = entry.endsWith("/");
        return { name: entry.replace(/\/$/, ""), isDirectory };
      }).sort((a, b) =>
        Number(b.isDirectory) - Number(a.isDirectory) ||
        a.name.localeCompare(b.name)
      );
      // Extension-less files are often WebAssembly binaries in this
      // sandbox; sniff the \0asm header so they get the right icon.
      // Bounded: namespace mirrors like js/ can hold hundreds of entries
      // whose reads hang, so cap the sniff count and timebox each read.
      const SNIFF_LIMIT = 12;
      const SNIFF_TIMEOUT_MS = 400;
      let sniffed = 0;
      await Promise.all(next.map(async (entry) => {
        if (entry.isDirectory || entry.name.includes(".")) return;
        if (sniffed >= SNIFF_LIMIT) return;
        sniffed++;
        try {
          const data = await Promise.race([
            getRoot().readFile(filesystemPathJoin(path, entry.name)),
            new Promise((resolve) =>
              setTimeout(() => resolve(null), SNIFF_TIMEOUT_MS)
            ),
          ]);
          if (data && sniffWasmBytes(data)) entry.iconKind = "wasm";
        } catch {
          // leave the generic icon if the file cannot be read
        }
      }));
      // Stat the listing (bounded: the wasm mirrors hold hundreds of
      // entries and large directory reads are the same hang risk) so
      // the info pane can sort by size / modified time.
      if (next.length <= 50) {
        await enrichEntryStats(getRoot, path, next, { timeoutMs: 250 });
      }
      setEntries(next);
      setStatus("");
    } catch (error) {
      setEntries([]);
      setStatus(error.message || "Unable to read this directory.");
    } finally {
      setLoading(false);
    }
  }, [path, getRoot]);

  const {
    contextMenu,
    setContextMenu,
    menuRef,
    openEntryFromMenu,
    deleteEntry,
    createInFolder,
    startRenameEntry,
    downloadEntry,
  } = useFilesContextMenu({
    getRoot,
    setStatus,
    openEntry: (entry) => openEditorEntry(entry, path),
    navigateTo,
    refresh,
    clearFileSelection,
    selectedPath,
    beginCreateIn: (entry, kind) => {
      setCreating(kind);
      setEntryName("");
      navigateTo(entry.path);
    },
    beginRename: (entry) => {
      setRenameTarget(entry);
      setCreating("rename-entry");
      setEntryName(entry.name);
    },
  });

  const { selectedInfo, setSelectedInfo, selectEntry } = useFilesSelection({
    getRoot,
    path,
    setHighlighted,
    setContextMenu,
  });

  const tree = useFilesTree({ getRoot, path });

  const {
    mounts,
    restoreMounts,
    handleMountLocalDir,
    unmountLocalDir,
    openMount,
  } = useLocalDirMounts({
    getKernel: useCallback(() => filesDep("wanixSystem")?._kernel, []),
    getRoot,
    currentPath: path,
    parentPath: filesystemPathParent,
    onStatus: setStatus,
    onNavigate: navigateTo,
    onRefresh: refresh,
  });

  useEffect(() => {
    refresh();
    const retry = () => {
      refresh();
      restoreMounts();
    };
    const system = filesDep("wanixSystem");
    if (system?._kernel?.isReady) {
      restoreMounts();
    } else {
      system?.addEventListener("ready", retry);
    }
    return () => system?.removeEventListener("ready", retry);
  }, [refresh, restoreMounts]);

  useEffect(() => {
    setPathDraft(path === "." ? "/" : `/${path.replace(/^\/+/, "")}`);
    setHighlighted(null);
    setContextMenu(null);
  }, [path]);

  const navigateToPath = () => {
    navigateTo(normalizeFilesystemPath(pathDraft));
  };

  const openEditorEntry = async (entry, currentPath) => {
    const result = await openEntry(entry, currentPath);
    if (result.isDirectory) {
      navigateTo(result.path);
      return;
    }
    setSelectedInfo(null);
    setStatus(result.error || "");
  };

  const {
    createEntry,
    saveFileHandler,
    removeFileHandler,
    removeDirectory,
    uploadFiles,
  } = useFilesActions({
    getRoot,
    path,
    selectedPath,
    renameTarget,
    creating,
    entryName,
    setCreating,
    setEntryName,
    setSelectedPath,
    setPath,
    setStatus,
    refresh,
    navigateTo,
    openEditorEntry,
    saveFile,
    removeFile,
    fileInputRef,
  });

  return React.createElement(
    "div",
    {
      ref: filesPanelRef,
      className: "files-panel panel-content",
      style: {
        "--files-sidebar-width": `${sidebarWidth}px`,
        "--files-sidebar-height": `${sidebarHeight}px`,
      },
    },
    React.createElement(FilesTopbar, {
      path,
      displayPath: selectedPath || selectedInfo?.path || path,
      pathDraft,
      loading,
      onPathDraftChange: setPathDraft,
      // Sync the draft from the breadcrumb's display path when entering
      // edit mode: the breadcrumb may show the selected entry's path
      // (e.g. /opfs/home) while `path` (and the stale draft) still point
      // at the current directory (/opfs).
      onStartEdit: () => {
        const target = selectedPath || selectedInfo?.path || path;
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
    }),
    React.createElement(
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
      React.createElement(FilesTree, {
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
        onOpen: (entry) =>
          openEditorEntry(entry, filesystemPathParent(entry.path)),
        onContextMenu: finePointer
          ? (entry, x, y) => {
            setContextMenu({
              x: Math.max(4, Math.min(x, window.innerWidth - 180)),
              y: Math.max(4, Math.min(y, window.innerHeight - 220)),
              entry: { ...entry, path: entry.path },
            });
          }
          : null,
      }),
    ),
    React.createElement(FilesResizer, {
      stackedLayout,
      sidebarWidth,
      sidebarHeight,
      onResizeStart: startSidebarResize,
      onResizeMove: resizeSidebar,
      onResizeStop: stopSidebarResize,
      onResizeBy: resizeSidebarBy,
    }),
    React.createElement(FilesContextMenu, {
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
    }),
    React.createElement(FilesRightPane, {
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
      // Single click selects in-place (the pane highlights the tile and
      // shows its details in the footer; the tree highlight mirrors it),
      // double click opens: directories enter, files open in the editor.
      // On touch the grid follows the tree and opens on a single tap.
      finePointer,
      onSelectChild: (child) => {
        const base = (selectedInfo && selectedInfo.path) || path;
        setHighlighted(filesystemPathJoin(base, child.name));
      },
      onOpenChild: (child) => {
        const base = (selectedInfo && selectedInfo.path) || path;
        openEditorEntry(child, base);
      },
    }),
  );
}

export { FilesPanel };
