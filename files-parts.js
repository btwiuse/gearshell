// files-parts.js — presentational pieces of the Files panel: path helpers,
// the sidebar toolbar, the entry list, and the editor pane. Split out of
// files.js (500-line rule); files.js owns the panel state and handlers,
// this module renders them without touching the filesystem itself.
import React from "react";
import {
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FilesInfoPane } from "./files-info.js?v=20260826.38";
import { FavoritesSidebar } from "./files-favorites-ui.js?v=20260826.38";
import { VolumesSidebar } from "./files-mounts.js?v=20260826.38";

// === Right pane (editor / directory grid preview) ===
// Composes the editor pane with a fallback "current directory" info
// object: with nothing selected, the right side previews the folder you
// are in as an Explorer-style icon grid. Kept in files-parts.js so
// files.js stays under the 500-line rule.

export function FilesRightPane({
  selectedPath,
  preview,
  contents,
  binary,
  dirty,
  info,
  entries,
  loading,
  status,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
  onDownload,
  onSave,
  onRename,
  onDelete,
  onChange,
  finePointer,
  onSelectChild,
  onOpenChild,
  currentPath,
}) {
  return React.createElement(FilesEditorPane, {
    selectedPath,
    preview,
    contents,
    binary,
    dirty,
    // With nothing selected, preview the current directory itself as a
    // grid (Windows-Explorer-style): entering a folder or opening a
    // favorite immediately shows its contents on the right.
    info: info || {
      path: currentPath === "." ? "/" : `/${currentPath.replace(/^\/+/, "")}`,
      name: currentPath === "." ? "/" : currentPath.split("/").pop(),
      isDirectory: true,
      size: null,
      modTime: null,
      previewKind: null,
      iconKind: null,
      preview: null,
      textPreview: null,
      loading,
      entries: entries.length,
      children: entries,
      childrenTotal: entries.length,
    },
    viewMode,
    onViewModeChange,
    sort,
    onSortChange,
    columnWidths,
    onColumnWidthChange,
    status,
    onDownload,
    onSave,
    onRename,
    onDelete,
    onChange,
    finePointer,
    onSelectChild,
    onOpenChild,
  });
}

// === Sidebar (favorites + volumes + creation form) ===

export function FilesSidebar({
  favorites,
  currentPath,
  onOpen,
  onRemove,
  mounts,
  onMount,
  onOpenMount,
  onUnmount,
  fileInputRef,
  creating,
  entryName,
  onEntryNameChange,
  onCreate,
  onCancel,
  onUpload,
  collapsedSections = {},
  onToggleSection,
  children,
}) {
  return React.createElement(
    "section",
    { className: "files-sidebar" },
    React.createElement(
      "div",
      {
        className: collapsedSections.explorer
          ? "files-section"
          : "files-section files-section-expanded",
      },
      React.createElement(
        "button",
        {
          type: "button",
          className: "files-sidebar-toggle files-section-header",
          onClick: () => onToggleSection("explorer"),
          "aria-expanded": !collapsedSections.explorer,
          title: collapsedSections.explorer
            ? "Expand Explorer"
            : "Collapse Explorer",
        },
        React.createElement(ChevronRight, {
          size: 13,
          className: collapsedSections.explorer ? "" : "open",
          "aria-hidden": true,
        }),
        React.createElement(
          "span",
          { className: "files-volumes-title" },
          "Explorer",
        ),
      ),
      !collapsedSections.explorer && children,
    ),
    React.createElement(FavoritesSidebar, {
      favorites,
      currentPath,
      onOpen,
      onRemove,
      collapsed: collapsedSections.favorites,
      onToggle: () => onToggleSection("favorites"),
    }),
    React.createElement(VolumesSidebar, {
      mounts,
      onMount,
      onOpen: onOpenMount,
      onUnmount,
      collapsed: collapsedSections.volumes,
      onToggle: () => onToggleSection("volumes"),
    }),
    React.createElement("input", {
      ref: fileInputRef,
      className: "files-upload-input",
      type: "file",
      multiple: true,
      onChange: onUpload,
    }),
    creating &&
      React.createElement(FilesCreateForm, {
        creating,
        entryName,
        onEntryNameChange,
        onCreate,
        onCancel,
      }),
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
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  onDownload,
  onSave,
  onRename,
  onDelete,
  onChange,
  finePointer,
  onSelectChild,
  onOpenChild,
  columnWidths,
  onColumnWidthChange,
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
      ? React.createElement(FilesInfoPane, {
        info,
        onOpenChild,
        onSelectChild,
        finePointer,
        viewMode,
        onViewModeChange,
        sort,
        onSortChange,
        columnWidths,
        onColumnWidthChange,
      })
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
      const step = event.key === "Home"
        ? -1e4
        : event.key === "End"
        ? 1e4
        : event.shiftKey
        ? 64
        : 16;
      const matches = isRow
        ? event.key === "ArrowUp" || event.key === "ArrowDown"
        : event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (event.key === "Home" || event.key === "End" || matches) {
        event.preventDefault();
        onResizeBy(
          event.key === "Home"
            ? -step
            : event.key === "End"
            ? step
            : event.key === "ArrowUp" || event.key === "ArrowLeft"
            ? -step
            : step,
        );
      }
    },
  });
}
