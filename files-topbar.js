// files-topbar.js — the Files panel's top location bar, styled after
// Windows Explorer: action buttons on the left, a clickable breadcrumb
// (or editable path input) pinned to the right. Kept in its own module
// so files-ui.js stays under the 500-line rule.
import React, { useState } from "react";
import {
  ArrowUp,
  FilePlus2,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { FilesBreadcrumb } from "./files-ui.js?v=20260826.26";

export function FilesTopbar({
  path,
  displayPath,
  pathDraft,
  loading,
  onPathDraftChange,
  onNavigate,
  onBreadcrumbNavigate,
  onParent,
  onRefresh,
  onUpload,
  onNewFile,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onStartEdit,
}) {
  const [editing, setEditing] = useState(false);
  const openEditor = (event) => {
    if (event.target.classList.contains("files-breadcrumb-current")) {
      onStartEdit();
      setEditing(true);
    }
  };
  return React.createElement(
    "div",
    { className: "files-topbar" },
    React.createElement(
      "div",
      { className: "files-topbar-actions" },
      React.createElement("button", {
        type: "button",
        title: "Parent folder",
        "aria-label": "Parent folder",
        disabled: path === ".",
        onClick: onParent,
      }, React.createElement(ArrowUp, { size: 15, "aria-hidden": true })),
      React.createElement("button", {
        type: "button",
        title: "Refresh files",
        "aria-label": "Refresh files",
        onClick: onRefresh,
      }, React.createElement(RefreshCw, {
        className: loading ? "files-spinning" : "",
        size: 15,
        "aria-hidden": true,
      })),
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
        React.createElement(React.Fragment, null,
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
    React.createElement(
      "div",
      { className: "files-topbar-location" },
      editing
        ? React.createElement("input", {
          className: "files-topbar-input",
          value: pathDraft,
          autoFocus: true,
          spellCheck: false,
          "aria-label": "Filesystem path",
          onChange: (event) => onPathDraftChange(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              onNavigate();
              setEditing(false);
            }
            if (event.key === "Escape") setEditing(false);
          },
          onBlur: () => setEditing(false),
        })
        : React.createElement(
          "div",
          { className: "files-topbar-breadcrumb-wrap", onClick: openEditor },
          React.createElement(FilesBreadcrumb, {
            path: displayPath,
            onNavigate: onBreadcrumbNavigate,
          }),
          React.createElement("button", {
            type: "button",
            className: "files-topbar-edit",
            title: "Edit path",
            "aria-label": "Edit path",
            onClick: () => {
              onStartEdit();
              setEditing(true);
            },
          }, React.createElement(Pencil, { size: 13, "aria-hidden": true })),
        ),
    ),
  );
}
