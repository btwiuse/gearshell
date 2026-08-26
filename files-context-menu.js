// files-context-menu.js — selection + actions behind the Files panel:
// the right-click context menu (open, create inside, download, delete)
// and the single-click info panel with inline previews (media, text
// excerpt, or metadata for binary files). Split out of files.js so the
// panel module stays under the 500-line rule.
import { useEffect, useRef, useState } from "react";
import { filesystemPathJoin } from "./files-parts.js?v=20260826.17";
import {
  getFilesystemPreviewType,
  isBinaryData,
  sniffWasmBytes,
  toFilesystemBytes,
} from "./files-editor.js?v=20260826.17";

// === Selection metadata (single-click info panel) ===

export function useFilesSelection({ getRoot, path, setHighlighted, setContextMenu }) {
  const [selectedInfo, setSelectedInfo] = useState(null);
  const previewUrlRef = useRef(null);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const selectEntry = async (entry) => {
    const nextPath = filesystemPathJoin(path, entry.name);
    setHighlighted(nextPath);
    setContextMenu(null);
    const base = {
      path: nextPath,
      name: entry.name,
      isDirectory: entry.isDirectory,
    };
    try {
      const stat = await getRoot().stat(nextPath);
      let entriesCount = null;
      if (entry.isDirectory) {
        try {
          const names = await getRoot().readDir(nextPath);
          entriesCount = (Array.isArray(names) ? names : []).length;
        } catch {
          // stat info is still useful without the item count
        }
      }
      const previewType = getFilesystemPreviewType(nextPath);
      let preview = null;
      let textPreview = null;
      let iconKind = null;
      if (!entry.isDirectory) {
        try {
          const data = await getRoot().readFile(nextPath);
          if (previewType) {
            const blob = new Blob([toFilesystemBytes(data)], {
              type: previewType.mime,
            });
            preview = { ...previewType, url: URL.createObjectURL(blob) };
          } else if (sniffWasmBytes(data)) {
            iconKind = "wasm";
          } else if (!isBinaryData(data)) {
            const bytes = toFilesystemBytes(data);
            textPreview = new TextDecoder().decode(bytes.subarray(0, 65536));
            if (bytes.byteLength > 65536) {
              textPreview += "\n\n… (truncated, double-click to open)";
            }
          }
        } catch {
          // metadata still shows even if the content cannot be read
        }
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = preview ? preview.url : null;
      setSelectedInfo({
        ...base,
        // wanix stat returns Go-style field names: Size, Mode, IsDir,
        // ModTime (unix seconds).
        size: stat?.Size ?? null,
        modTime: stat?.ModTime ?? null,
        previewKind: previewType ? previewType.kind : null,
        entries: entriesCount,
        iconKind,
        preview,
        textPreview,
      });
    } catch {
      setSelectedInfo({
        ...base,
        size: null,
        modTime: null,
        previewKind: null,
        entries: null,
        iconKind: null,
        preview: null,
        textPreview: null,
      });
    }
  };

  return { selectedInfo, setSelectedInfo, selectEntry };
}

export function useFilesContextMenu({
  getRoot,
  setStatus,
  openEntry,
  navigateTo,
  refresh,
  clearFileSelection,
  selectedPath,
  beginCreateIn,
  beginRename,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (event) => {
      // Keep the menu open for clicks inside it; only close on outside
      // clicks. Closing on the menu's own pointerdown would unmount the
      // menu before the click lands, breaking every menu item.
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      setContextMenu(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const openEntryFromMenu = (entry) => {
    setContextMenu(null);
    if (entry.isDirectory) {
      navigateTo(entry.path);
      return;
    }
    openEntry(entry);
  };

  const deleteEntry = async (entry) => {
    setContextMenu(null);
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    try {
      await getRoot().remove(entry.path);
      if (selectedPath === entry.path) clearFileSelection();
      setStatus("Deleted.");
      await refresh();
    } catch (error) {
      setStatus(error.message || "Unable to delete this entry.");
    }
  };

  const createInFolder = (entry, kind) => {
    setContextMenu(null);
    beginCreateIn(entry, kind);
  };

  const startRenameEntry = (entry) => {
    setContextMenu(null);
    beginRename(entry);
  };

  const downloadEntry = async (entry) => {
    setContextMenu(null);
    try {
      const data = await getRoot().readFile(entry.path);
      const type = getFilesystemPreviewType(entry.path);
      const blob = new Blob([toFilesystemBytes(data)], {
        type: type ? type.mime : "application/octet-stream",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = entry.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 0);
    } catch (error) {
      setStatus(error.message || "Unable to download this file.");
    }
  };

  return {
    contextMenu,
    setContextMenu,
    menuRef,
    openEntryFromMenu,
    deleteEntry,
    createInFolder,
    startRenameEntry,
    downloadEntry,
  };
}
