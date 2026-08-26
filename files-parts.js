// files-parts.js — presentational pieces of the Files panel: path helpers,
// the sidebar toolbar, the entry list, and the editor pane. Split out of
// files.js (500-line rule); files.js owns the panel state and handlers,
// this module renders them without touching the filesystem itself.
import React from "react";
import {
  Check,
  Download,
  FileCode2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FilesInfoPane, getEntryIcon } from "./files-ui.js?v=20260826.17";

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
  if (base.startsWith("/")) {
    return `${base.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
  }
  return normalizeFilesystemPath(base === "." ? name : `${base}/${name}`);
}

export function filesystemPathParent(path) {
  const parts = normalizeFilesystemPath(path).split("/").filter((part) =>
    part && part !== "."
  );
  parts.pop();
  return parts.join("/") || ".";
}

// === Entry list ===

export function FilesEntryList({
  entries,
  selectedPath,
  path,
  loading,
  status,
  onSelect,
  onOpen,
  onContextMenu,
  finePointer,
}) {
  return React.createElement(
    "div",
    { className: "files-list", role: "list" },
    entries.map((entry) => {
      const EntryIcon = getEntryIcon(entry.name, entry.isDirectory, entry.iconKind);
      return React.createElement(
        "button",
        {
          key: `${entry.isDirectory ? "d" : "f"}:${entry.name}`,
          type: "button",
          role: "listitem",
          className: selectedPath === filesystemPathJoin(path, entry.name)
            ? "selected"
            : "",
          title: entry.name,
          onClick: () => (finePointer ? onSelect(entry) : onOpen(entry)),
          onDoubleClick: finePointer ? () => onOpen(entry) : undefined,
          onContextMenu: onContextMenu
            ? (event) => {
              event.preventDefault();
              onContextMenu(entry, event.clientX, event.clientY);
            }
            : undefined,
        },
        React.createElement(EntryIcon, { size: 15, "aria-hidden": true }),
        React.createElement("span", null, entry.name),
      );
    }),
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
  binary,
  info,
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
              : preview.kind === "video"
              ? React.createElement("video", {
                src: preview.url,
                controls: true,
                preload: "metadata",
              })
              : preview.kind === "pdf"
              ? React.createElement("iframe", {
                src: preview.url,
                title: "PDF preview",
              })
              : React.createElement(
                "p",
                { className: "files-media-unsupported" },
                "Preview is not available for this file type. Use Download to open it.",
              ),
          ),
        )
        : React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            { className: "files-editor-toolbar" },
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
          binary
            ? React.createElement(
              "div",
              { className: "files-editor-empty" },
              React.createElement(FileCode2, { size: 28, "aria-hidden": true }),
              React.createElement(
                "p",
                { className: "files-binary-hint" },
                "Binary file — preview is not available. Use Download to open it.",
              ),
            )
            : React.createElement("textarea", {
              value: contents,
              spellCheck: false,
              "aria-label": `Contents of ${selectedPath}`,
              onChange: (event) => onChange(event.target.value),
            }),
        )
      : info
      ? React.createElement(FilesInfoPane, { info })
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
  onResizeBy,
}) {
  return React.createElement("div", {
    className: "files-resizer",
    role: "separator",
    tabIndex: 0,
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
    onKeyDown: (event) => {
      const isRow = stackedLayout;
      const step = event.key === "Home" ? -1e4 :
        event.key === "End" ? 1e4 :
        event.shiftKey ? 64 : 16;
      const matches = isRow
        ? event.key === "ArrowUp" || event.key === "ArrowDown"
        : event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (event.key === "Home" || event.key === "End" || matches) {
        event.preventDefault();
        onResizeBy(event.key === "Home" ? -step :
          event.key === "End" ? step :
          event.key === "ArrowUp" || event.key === "ArrowLeft" ? -step : step);
      }
    },
  });
}
