// Files: the Files panel — a tree-view file browser over the Wanix
// filesystem, with a built-in text/image/audio/PDF editor.
//
// This module owns the `files` dockview panel end-to-end. The
// filesystem helpers (path normalization, byte conversion, preview
// type detection) are all local to this module so the panel logic
// and its data-shape handling travel together.
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
} from "./files-mounts.js?v=20260826.5";
import {
  decodeFilesystemText,
  FilesCreateForm,
  FilesEditorPane,
  FilesEntryList,
  FilesResizer,
  FilesToolbar,
  filesystemPathJoin,
  filesystemPathParent,
  getFilesystemPreviewType,
  normalizeFilesystemPath,
  toFilesystemBytes,
} from "./files-parts.js?v=20260826.5";

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

// === Filesystem helpers ===
// Path normalization + byte conversion + preview-type detection for
// the Files panel. Each is a small standalone function that the
// panel calls per-file/per-path. They are not used outside this
// module.

function FilesPanel() {
  const fileInputRef = useRef(null);
  const filesPanelRef = useRef(null);
  const sidebarResizeRef = useRef(null);
  const [path, setPath] = useState(".");
  const [pathDraft, setPathDraft] = useState("/");
  const [entries, setEntries] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [contents, setContents] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const [preview, setPreview] = useState(null);
  const [creating, setCreating] = useState(null);
  const [entryName, setEntryName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarHeight, setSidebarHeight] = useState(220);
  const [stackedLayout, setStackedLayout] = useState(() =>
    window.matchMedia("(max-width: 560px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const updateLayout = () => setStackedLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(
    () => () =>
      document.body.classList.remove("files-resizing", "files-resizing-row"),
    [],
  );

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const clearFileSelection = () => {
    setSelectedPath(null);
    setContents("");
    setSavedContents("");
    setPreview(null);
  };

  const startSidebarResize = (event) => {
    if (event.button !== 0) return;
    const panelBounds = filesPanelRef.current?.getBoundingClientRect();
    if (!panelBounds) return;
    event.preventDefault();
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      stacked: stackedLayout,
      panelLeft: panelBounds.left,
      panelTop: panelBounds.top,
      maxSize: stackedLayout
        ? Math.max(130, panelBounds.height - 180)
        : Math.max(190, panelBounds.width - 240),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add(
      stackedLayout ? "files-resizing-row" : "files-resizing",
    );
  };

  const resizeSidebar = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextSize = resize.stacked
      ? event.clientY - resize.panelTop
      : event.clientX - resize.panelLeft;
    if (resize.stacked) {
      setSidebarHeight(Math.max(130, Math.min(resize.maxSize, nextSize)));
    } else {
      setSidebarWidth(Math.max(190, Math.min(resize.maxSize, nextSize)));
    }
  };

  const stopSidebarResize = (event) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    sidebarResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("files-resizing", "files-resizing-row");
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const names = await filesDep("getWanixRoot")().readDir(path);
      const next = (Array.isArray(names) ? names : []).map((entry) => {
        const isDirectory = entry.endsWith("/");
        return { name: entry.replace(/\/$/, ""), isDirectory };
      }).sort((a, b) =>
        Number(b.isDirectory) - Number(a.isDirectory) ||
        a.name.localeCompare(b.name)
      );
      setEntries(next);
      setStatus("");
    } catch (error) {
      setEntries([]);
      setStatus(error.message || "Unable to read this directory.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  const {
    mounts,
    restoreMounts,
    handleMountLocalDir,
    unmountLocalDir,
    openMount,
  } = useLocalDirMounts({
    getKernel: useCallback(() => filesDep("wanixSystem")?._kernel, []),
    getRoot: useCallback(() => filesDep("getWanixRoot")(), []),
    currentPath: path,
    parentPath: filesystemPathParent,
    onStatus: setStatus,
    onNavigate: (nextPath) => {
      setPath(nextPath);
      clearFileSelection();
    },
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
    setPathDraft(path === "." ? "/" : `/${path}`);
  }, [path]);

  const navigateToPath = () => {
    const nextPath = normalizeFilesystemPath(pathDraft);
    setPath(nextPath);
    clearFileSelection();
  };

  const openEntry = async (entry) => {
    const nextPath = filesystemPathJoin(path, entry.name);
    if (entry.isDirectory) {
      setPath(nextPath);
      clearFileSelection();
      return;
    }
    try {
      const data = await filesDep("getWanixRoot")().readFile(nextPath);
      const previewType = getFilesystemPreviewType(nextPath);
      setSelectedPath(nextPath);
      if (previewType) {
        const blob = new Blob([toFilesystemBytes(data)], {
          type: previewType.mime,
        });
        setPreview({ ...previewType, blob, url: URL.createObjectURL(blob) });
        setContents("");
        setSavedContents("");
      } else {
        const text = decodeFilesystemText(data);
        setPreview(null);
        setContents(text);
        setSavedContents(text);
      }
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to open this file.");
    }
  };

  const createEntry = async () => {
    const name = entryName.trim();
    if (!name || name.includes("/") || name === "." || name === "..") {
      setStatus("Enter a name without a path separator.");
      return;
    }
    try {
      const entryPath = filesystemPathJoin(path, name);
      const root = filesDep("getWanixRoot")();
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
      } else if (creating === "folder") {
        await root.makeDir(entryPath);
      } else {
        await root.writeFile(entryPath, "");
      }
      setCreating(null);
      setEntryName("");
      await refresh();
      if (creating === "file") await openEntry({ name, isDirectory: false });
    } catch (error) {
      setStatus(error.message || "Unable to create this entry.");
    }
  };

  const saveFile = async () => {
    if (!selectedPath) return;
    try {
      await filesDep("getWanixRoot")().writeFile(selectedPath, contents);
      setSavedContents(contents);
      await refresh();
      setStatus("Saved.");
    } catch (error) {
      setStatus(error.message || "Unable to save this file.");
    }
  };

  const removeFile = async () => {
    if (!selectedPath || !window.confirm(`Delete ${selectedPath}?`)) return;
    try {
      await filesDep("getWanixRoot")().remove(selectedPath);
      clearFileSelection();
      setStatus("Deleted.");
      await refresh();
    } catch (error) {
      setStatus(error.message || "Unable to delete this file.");
    }
  };

  const removeDirectory = async () => {
    if (path === "." || !window.confirm(`Delete the empty folder /${path}?`)) {
      return;
    }
    try {
      const parent = filesystemPathParent(path);
      await filesDep("getWanixRoot")().remove(path);
      setPath(parent);
      clearFileSelection();
      setStatus("Deleted empty folder.");
    } catch (error) {
      setStatus(error.message || "Only empty folders can be deleted here.");
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      const root = filesDep("getWanixRoot")();
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

  const downloadFile = () => {
    if (!selectedPath) return;
    const link = document.createElement("a");
    const blob = preview?.blob ||
      new Blob([contents], { type: "text/plain;charset=utf-8" });
    link.href = URL.createObjectURL(blob);
    link.download = selectedPath.split("/").pop() || "download";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };

  const dirty = selectedPath && !preview && contents !== savedContents;
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
    React.createElement(
      "section",
      { className: "files-sidebar" },
      React.createElement(FilesToolbar, {
        pathDraft,
        path,
        loading,
        onPathDraftChange: setPathDraft,
        onNavigate: navigateToPath,
        onParent: () => {
          setPath(filesystemPathParent(path));
          clearFileSelection();
        },
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
        selectedPath,
        path,
        loading,
        status,
        onOpen: openEntry,
      }),
    ),
    React.createElement(FilesResizer, {
      stackedLayout,
      sidebarWidth,
      sidebarHeight,
      onResizeStart: startSidebarResize,
      onResizeMove: resizeSidebar,
      onResizeStop: stopSidebarResize,
    }),
    React.createElement(FilesEditorPane, {
      selectedPath,
      preview,
      contents,
      dirty,
      status,
      onDownload: downloadFile,
      onSave: saveFile,
      onRename: () => {
        setCreating("rename-file");
        setEntryName(selectedPath.split("/").pop() || "");
      },
      onDelete: removeFile,
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
