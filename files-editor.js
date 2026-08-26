// files-editor.js — state + actions for the Files panel's editor pane:
// opening files (text, media, PDF, binary guard), saving, deleting,
// downloading, plus the byte/preview helpers they share with the
// context-menu module. Lives in its own module so FilesPanel in
// files.js stays under the 500-line rule; all filesystem access goes
// through getRoot().
import { useCallback, useEffect, useState } from "react";
import {
  filesystemPathJoin,
  filesystemPathParent,
} from "./files-path.js?v=20260826.38";

// === File helpers (preview-type detection + byte conversion) ===
// Shared with files-context-menu.js so both modules treat bytes and
// preview types identically.

const FILE_PREVIEW_TYPES = {
  image: {
    mime: (name) => {
      const lower = name.toLowerCase();
      if (lower.endsWith(".png") || lower.endsWith(".gif")) return "image/png";
      if (lower.endsWith(".webp")) return "image/webp";
      return "image/jpeg";
    },
    kind: "image",
  },
  video: {
    mime: (name) => "video/mp4",
    kind: "video",
  },
  audio: {
    mime: (name) => "audio/mpeg",
    kind: "audio",
  },
  pdf: {
    mime: "application/pdf",
    kind: "pdf",
  },
};

export function getFilesystemPreviewType(path) {
  const lower = path.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return FILE_PREVIEW_TYPES.image;
  if (/\.(mp4|webm)$/.test(lower)) return FILE_PREVIEW_TYPES.video;
  if (/\.(mp3|wav|ogg)$/.test(lower)) return FILE_PREVIEW_TYPES.audio;
  if (lower.endsWith(".pdf")) return FILE_PREVIEW_TYPES.pdf;
  return null;
}

export function toFilesystemBytes(contents) {
  if (contents instanceof Uint8Array) return contents;
  if (ArrayBuffer.isView(contents)) {
    return new Uint8Array(
      contents.buffer,
      contents.byteOffset,
      contents.byteLength,
    );
  }
  return new Uint8Array(contents);
}

export function decodeFilesystemText(contents) {
  const bytes = toFilesystemBytes(contents);
  if (bytes.byteLength > 1024 * 1024) {
    throw new Error("Files larger than 1 MiB cannot be opened in this editor.");
  }
  return new TextDecoder().decode(bytes);
}

// Decide whether a file's bytes are binary (zip, executables, office
// docs...) rather than editable text. Looks at a 4 KiB sample: a NUL
// byte or a high ratio of UTF-8 replacement characters means binary.
export function isBinaryData(contents) {
  const bytes = toFilesystemBytes(contents);
  const sample = bytes.subarray(0, 4096);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(sample);
  let replacements = 0;
  for (const char of decoded) {
    if (char === "\uFFFD") replacements++;
  }
  return replacements / Math.max(decoded.length, 1) > 0.05;
}

// WebAssembly binaries start with the \0asm magic: 00 61 73 6D.
// Many files in the sandbox are extension-less wasm, so sniff the
// header instead of relying on the file name.
export function sniffWasmBytes(contents) {
  const bytes = toFilesystemBytes(contents);
  return bytes.byteLength >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d;
}

export function useFilesEditor(getRoot) {
  const [selectedPath, setSelectedPath] = useState(null);
  const [contents, setContents] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const [preview, setPreview] = useState(null);
  const [binary, setBinary] = useState(false);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const clearFileSelection = useCallback(() => {
    setSelectedPath(null);
    setContents("");
    setSavedContents("");
    setPreview(null);
    setBinary(false);
  }, []);

  const openEntry = useCallback(async (entry, currentPath) => {
    const nextPath = filesystemPathJoin(currentPath, entry.name);
    if (entry.isDirectory) return { isDirectory: true, path: nextPath };
    try {
      const data = await getRoot().readFile(nextPath);
      const previewType = getFilesystemPreviewType(nextPath);
      setSelectedPath(nextPath);
      if (previewType) {
        const blob = new Blob([toFilesystemBytes(data)], {
          type: previewType.mime,
        });
        setPreview({ ...previewType, blob, url: URL.createObjectURL(blob) });
        setContents("");
        setSavedContents("");
        setBinary(false);
      } else if (isBinaryData(data)) {
        setPreview(null);
        setContents("");
        setSavedContents("");
        setBinary(true);
      } else {
        const text = decodeFilesystemText(data);
        setPreview(null);
        setContents(text);
        setSavedContents(text);
        setBinary(false);
      }
      return { isDirectory: false, path: nextPath, error: null };
    } catch (error) {
      return {
        isDirectory: false,
        path: nextPath,
        error: error.message || "Unable to open this file.",
      };
    }
  }, [getRoot]);

  const saveFile = useCallback(async (targetPath) => {
    if (!targetPath) return { ok: false, message: null };
    try {
      await getRoot().writeFile(targetPath, contents);
      setSavedContents(contents);
      return { ok: true, message: "Saved." };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Unable to save this file.",
      };
    }
  }, [contents, getRoot]);

  const removeFile = useCallback(async (targetPath) => {
    try {
      await getRoot().remove(targetPath);
      clearFileSelection();
      return { ok: true, message: "Deleted." };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Unable to delete this file.",
      };
    }
  }, [getRoot, clearFileSelection]);

  const downloadFile = useCallback(() => {
    if (!selectedPath) return;
    const link = document.createElement("a");
    const blob = preview?.blob ||
      new Blob([contents], { type: "text/plain;charset=utf-8" });
    link.href = URL.createObjectURL(blob);
    link.download = selectedPath.split("/").pop() || "download";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }, [selectedPath, preview, contents]);

  const dirty = selectedPath && !preview && !binary &&
    contents !== savedContents;
  return {
    selectedPath,
    contents,
    savedContents,
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
  };
}

// === Filesystem actions (create / rename / save / delete / upload) ===
// The mutation handlers for FilesPanel, kept here so files.js only
// orchestrates. All filesystem access goes through getRoot().

export function useFilesActions({
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
}) {
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

  return {
    createEntry,
    saveFileHandler,
    removeFileHandler,
    removeDirectory,
    uploadFiles,
  };
}
