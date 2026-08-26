// files-parts.js — presentational pieces of the Files panel: path helpers,
// the sidebar toolbar, the entry list, and the editor pane. Split out of
// files.js (500-line rule); files.js owns the panel state and handlers,
// this module renders them without touching the filesystem itself.
import React from "react";
import {
  ArrowRight,
  ArrowUp,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

// === Path helpers (shared by the panel and the mount sidebar) ===

export function normalizeFilesystemPath(path = ".") {
  const parts = [];
  for (const part of String(path).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/") || ".";
}

export function filesystemPathJoin(base, name) {
  return normalizeFilesystemPath(base === "." ? name : `${base}/${name}`);
}

export function filesystemPathParent(path) {
  const parts = normalizeFilesystemPath(path).split("/").filter((part) =>
    part && part !== "."
  );
  parts.pop();
  return parts.join("/") || ".";
}

// === Sidebar toolbar ===

export function FilesToolbar({
  pathDraft,
  path,
  loading,
  onPathDraftChange,
  onNavigate,
  onParent,
  onRefresh,
  onUpload,
  onNewFile,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
}) {
  return React.createElement(
    "div",
    { className: "files-toolbar" },
    React.createElement("input", {
      value: pathDraft,
      "aria-label": "Filesystem path",
      spellCheck: false,
      onChange: (event) => onPathDraftChange(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") onNavigate();
      },
    }),
    React.createElement(
      "div",
      { className: "files-toolbar-actions" },
      React.createElement("button", {
        type: "button",
        title: "Go to path",
        "aria-label": "Go to path",
        onClick: onNavigate,
      }, React.createElement(ArrowRight, { size: 15, "aria-hidden": true })),
      React.createElement("button", {
        type: "button",
        title: "Parent folder",
        "aria-label": "Parent folder",
        disabled: path === ".",
        onClick: onParent,
      }, React.createElement(ArrowUp, { size: 15, "aria-hidden": true })),
      React.createElement(
        "button",
        {
          type: "button",
          title: "Refresh files",
          "aria-label": "Refresh files",
          onClick: onRefresh,
        },
        React.createElement(RefreshCw, {
          className: loading ? "files-spinning" : "",
          size: 15,
          "aria-hidden": true,
        }),
      ),
      React.createElement("button", {
        type: "button",
        title: "Upload files",
        "aria-label": "Upload files",
        onClick: onUpload,
      }, React.createElement(Upload, { size: 15, "aria-hidden": true })),
      React.createElement("button", {
        type: "button",
        title: "New file",
        "aria-label": "New file",
        onClick: onNewFile,
      }, React.createElement(FilePlus2, { size: 15, "aria-hidden": true })),
      React.createElement("button", {
        type: "button",
        title: "New folder",
        "aria-label": "New folder",
        onClick: onNewFolder,
      }, React.createElement(FolderPlus, { size: 15, "aria-hidden": true })),
      path !== "." &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement("button", {
            type: "button",
            title: "Rename folder",
            "aria-label": "Rename folder",
            onClick: onRenameFolder,
          }, React.createElement(Pencil, { size: 15, "aria-hidden": true })),
          React.createElement("button", {
            type: "button",
            title: "Delete empty folder",
            "aria-label": "Delete empty folder",
            onClick: onDeleteFolder,
          }, React.createElement(Trash2, { size: 15, "aria-hidden": true })),
        ),
    ),
  );
}

// === Entry list ===

export function FilesEntryList(
  { entries, selectedPath, path, loading, status, onOpen },
) {
  return React.createElement(
    "div",
    { className: "files-list", role: "list" },
    entries.map((entry) =>
      React.createElement(
        "button",
        {
          key: `${entry.isDirectory ? "d" : "f"}:${entry.name}`,
          type: "button",
          role: "listitem",
          className: selectedPath === filesystemPathJoin(path, entry.name)
            ? "selected"
            : "",
          title: entry.name,
          onClick: () => onOpen(entry),
        },
        React.createElement(entry.isDirectory ? FolderOpen : FileCode2, {
          size: 15,
          "aria-hidden": true,
        }),
        React.createElement("span", null, entry.name),
      )
    ),
    !loading && entries.length === 0 && !status &&
      React.createElement(
        "p",
        { className: "files-empty" },
        "Folder is empty.",
      ),
  );
}

// === Editor pane ===

export function FilesEditorPane({
  selectedPath,
  preview,
  contents,
  dirty,
  status,
  onDownload,
  onSave,
  onRename,
  onDelete,
  onChange,
}) {
  return React.createElement(
    "section",
    { className: "files-editor" },
    selectedPath
      ? preview
        ? React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "files-editor-toolbar" },
            React.createElement(
              "code",
              { title: selectedPath },
              `/${selectedPath}`,
            ),
            React.createElement(
              "div",
              { className: "files-toolbar-actions" },
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Download file",
                  "aria-label": "Download file",
                  onClick: onDownload,
                },
                React.createElement(Download, {
                  size: 15,
                  "aria-hidden": true,
                }),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Rename file",
                  "aria-label": "Rename file",
                  onClick: onRename,
                },
                React.createElement(Pencil, { size: 15, "aria-hidden": true }),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Delete file",
                  "aria-label": "Delete file",
                  onClick: onDelete,
                },
                React.createElement(Trash2, { size: 15, "aria-hidden": true }),
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: `files-media-preview ${preview.kind}` },
            preview.kind === "image"
              ? React.createElement("img", {
                src: preview.url,
                alt: selectedPath.split("/").pop() || "Image preview",
              })
              : preview.kind === "audio"
              ? React.createElement("audio", {
                src: preview.url,
                controls: true,
                preload: "metadata",
              })
              : React.createElement("video", {
                src: preview.url,
                controls: true,
                preload: "metadata",
              }),
          ),
        )
        : React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "files-editor-toolbar" },
            React.createElement(
              "code",
              { title: selectedPath },
              `/${selectedPath}`,
            ),
            React.createElement(
              "div",
              { className: "files-toolbar-actions" },
              React.createElement("button", {
                type: "button",
                title: "Save file",
                "aria-label": "Save file",
                disabled: !dirty,
                onClick: onSave,
              }, React.createElement(Save, { size: 15, "aria-hidden": true })),
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Download file",
                  "aria-label": "Download file",
                  onClick: onDownload,
                },
                React.createElement(Download, {
                  size: 15,
                  "aria-hidden": true,
                }),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Rename file",
                  "aria-label": "Rename file",
                  onClick: onRename,
                },
                React.createElement(Pencil, { size: 15, "aria-hidden": true }),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  title: "Delete file",
                  "aria-label": "Delete file",
                  onClick: onDelete,
                },
                React.createElement(Trash2, { size: 15, "aria-hidden": true }),
              ),
            ),
          ),
          React.createElement("textarea", {
            value: contents,
            spellCheck: false,
            "aria-label": `Contents of ${selectedPath}`,
            onChange: (event) => onChange(event.target.value),
          }),
        )
      : React.createElement(
        "div",
        { className: "files-editor-empty" },
        React.createElement(FileCode2, { size: 28, "aria-hidden": true }),
      ),
    status &&
      React.createElement(
        "div",
        { className: "files-status", role: "status" },
        status,
      ),
  );
}

// === Create entry form ===

// === File helpers (preview-type detection + byte conversion) ===

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

export function FilesCreateForm(
  { creating, entryName, onEntryNameChange, onCreate, onCancel },
) {
  return React.createElement(
    "div",
    { className: "files-create" },
    React.createElement("input", {
      autoFocus: true,
      value: entryName,
      placeholder: creating.includes("folder") ? "folder name" : "file name",
      onChange: (event) => onEntryNameChange(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") onCreate();
        if (event.key === "Escape") onCancel();
      },
    }),
    React.createElement("button", {
      type: "button",
      title: `Create ${creating}`,
      "aria-label": `Create ${creating}`,
      onClick: onCreate,
    }, React.createElement(Check, { size: 15, "aria-hidden": true })),
    React.createElement("button", {
      type: "button",
      title: "Cancel",
      "aria-label": "Cancel",
      onClick: onCancel,
    }, React.createElement(X, { size: 15, "aria-hidden": true })),
  );
}

// === Sidebar resizer ===

export function FilesResizer({
  stackedLayout,
  sidebarWidth,
  sidebarHeight,
  onResizeStart,
  onResizeMove,
  onResizeStop,
}) {
  return React.createElement("div", {
    className: "files-resizer",
    role: "separator",
    "aria-label": stackedLayout
      ? "Resize file browser file list height"
      : "Resize file browser sidebar",
    "aria-orientation": stackedLayout ? "horizontal" : "vertical",
    "aria-valuemin": stackedLayout ? 130 : 190,
    "aria-valuenow": Math.round(stackedLayout ? sidebarHeight : sidebarWidth),
    onPointerDown: onResizeStart,
    onPointerMove: onResizeMove,
    onPointerUp: onResizeStop,
    onPointerCancel: onResizeStop,
  });
}
