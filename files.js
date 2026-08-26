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
} from "./files-mounts.js?v=20260826.17";
import {
  FilesCreateForm,
  FilesEditorPane,
  FilesEntryList,
  FilesResizer,
  filesystemPathJoin,
  filesystemPathParent,
  normalizeFilesystemPath,
} from "./files-parts.js?v=20260826.17";
import {
  FilesContextMenu,
  FavoritesSidebar,
} from "./files-ui.js?v=20260826.17";
import { FilesTopbar } from "./files-topbar.js?v=20260826.17";
import { useFilesEditor } from "./files-editor.js?v=20260826.17";
import { sniffWasmBytes } from "./files-editor.js?v=20260826.17";
import { useFilesSidebarResize } from "./files-resize.js?v=20260826.17";
import { useFilesContextMenu, useFilesSelection } from "./files-context-menu.js?v=20260826.17";
import { useFavorites } from "./files-favorites.js?v=20260826.17";

let __filesDeps = null;
export function initFiles(dependencies) {
  __filesDeps = dependencies;
}
function filesDep(name) {
  if (__filesDeps == null) {
    throw new Error(
      "files: initFiles() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __filesDeps[name];
  if (value === undefined) {
    throw new Error(`files: missing dependency ${name}`);
  }
  return value;
}

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
    setPath(nextPath);
    clearFileSelection();
    setHighlighted(null);
    setSelectedInfo(null);
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
      await Promise.all(next.map(async (entry) => {
        if (entry.isDirectory || entry.name.includes(".")) return;
        try {
          const data = await getRoot().readFile(
            filesystemPathJoin(path, entry.name),
          );
          if (sniffWasmBytes(data)) entry.iconKind = "wasm";
        } catch {
          // leave the generic icon if the file cannot be read
        }
      }));
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

  const createEntry = async () => {
    const name = entryName.trim();
    if (!name || name.includes("/") || name === "." || name === "..") {
      setStatus("Enter a name without a path separator.");
      return;
    }
    try {
      const entryPath = filesystemPathJoin(path, name);
      const root = getRoot();
      if (creating === "rename-file" && selectedPath) {
        await root.rename(
          selectedPath,
          filesystemPathJoin(filesystemPathParent(selectedPath), name),
        );
        setSelectedPath(
          filesystemPathJoin(filesystemPathParent(selectedPath), name),
        );
      } else if (creating === "rename-folder") {
        const nextPath = filesystemPathJoin(filesystemPathParent(path), name);
        await root.rename(path, nextPath);
        setPath(nextPath);
      } else if (creating === "rename-entry" && renameTarget) {
        const nextPath = filesystemPathJoin(
          filesystemPathParent(renameTarget.path),
          name,
        );
        await root.rename(renameTarget.path, nextPath);
        if (selectedPath === renameTarget.path) {
          setSelectedPath(nextPath);
        }
      } else if (creating === "folder") {
        await root.makeDir(entryPath);
      } else {
        await root.writeFile(entryPath, "");
      }
      setCreating(null);
      setEntryName("");
      await refresh();
      if (creating === "file") {
        await openEditorEntry({ name, isDirectory: false }, path);
      }
    } catch (error) {
      setStatus(error.message || "Unable to create this entry.");
    }
  };

  const saveFileHandler = async () => {
    const result = await saveFile(selectedPath);
    if (result.message) setStatus(result.message);
    if (result.ok) await refresh();
  };

  const removeFileHandler = async () => {
    if (!selectedPath || !window.confirm(`Delete ${selectedPath}?`)) return;
    const result = await removeFile(selectedPath);
    if (result.message) setStatus(result.message);
    if (result.ok) await refresh();
  };

  const removeDirectory = async () => {
    if (path === "." || !window.confirm(`Delete the empty folder /${path}?`)) {
      return;
    }
    try {
      const parent = filesystemPathParent(path);
      await getRoot().remove(path);
      navigateTo(parent);
      setStatus("Deleted empty folder.");
    } catch (error) {
      setStatus(error.message || "Only empty folders can be deleted here.");
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      const root = getRoot();
      for (const file of files) {
        await root.writeFile(
          filesystemPathJoin(path, file.name),
          new Uint8Array(await file.arrayBuffer()),
        );
      }
      await refresh();
      setStatus(
        `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setStatus(error.message || "Unable to upload these files.");
    } finally {
      event.target.value = "";
    }
  };

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
      "section",
      { className: "files-sidebar" },
      React.createElement(FavoritesSidebar, {
        favorites,
        currentPath: path,
        onOpen: navigateTo,
        onRemove: removeFavorite,
      }),
      React.createElement(VolumesSidebar, {
        mounts,
        onMount: handleMountLocalDir,
        onOpen: openMount,
        onUnmount: unmountLocalDir,
      }),
      React.createElement("input", {
        ref: fileInputRef,
        className: "files-upload-input",
        type: "file",
        multiple: true,
        onChange: uploadFiles,
      }),
      creating &&
        React.createElement(FilesCreateForm, {
          creating,
          entryName,
          onEntryNameChange: setEntryName,
          onCreate: createEntry,
          onCancel: () => setCreating(null),
        }),
      React.createElement(FilesEntryList, {
        entries,
        selectedPath: highlighted,
        path,
        loading,
        status,
        finePointer,
        onSelect: selectEntry,
        onOpen: (entry) => openEditorEntry(entry, path),
        onContextMenu: finePointer
          ? (entry, x, y) => {
            setContextMenu({
              x: Math.max(4, Math.min(x, window.innerWidth - 180)),
              y: Math.max(4, Math.min(y, window.innerHeight - 220)),
              entry: { ...entry, path: filesystemPathJoin(path, entry.name) },
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
      isFavorite: contextMenu
        ? isFavoritePath(contextMenu.entry.path)
        : false,
    }),
    React.createElement(FilesEditorPane, {
      selectedPath,
      preview,
      contents,
      binary,
      dirty,
      info: selectedInfo,
      status,
      onDownload: downloadFile,
      onSave: saveFileHandler,
      onRename: () => {
        setCreating("rename-file");
        setEntryName(selectedPath.split("/").pop() || "");
      },
      onDelete: removeFileHandler,
      onChange: setContents,
    }),
  );
}

// === Panel registration ===
// Counter for unique Files panel ids. The counter is module-scoped
// so it survives React re-renders but resets on page reload.
let filesIdCounter = 0;

// Register a new Files panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Files from the panel
// menu, and from the restore-saved-panels path on boot.
export function addFilesPanel(api, group) {
  const id = ++filesIdCounter;
  const panel = api.addPanel({
    id: `files-${id}`,
    component: "files",
    params: { filesId: id, panelType: "files" },
    title: "Files",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = filesDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "files" });
  panel.api.setActive();
  return panel;
}

export { FilesPanel };
