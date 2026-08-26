// files-context-menu-ui.js — the Files panel's right-click context menu
// (open, create inside, add to favorites, download, rename, delete).
// Split out of files-ui.js when that module crossed the 500-line rule.
import React from "react";
import {
  Download,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Play,
  Star,
  Trash2,
} from "lucide-react";
// === Context menu ===

export function FilesContextMenu({
  menu,
  menuRef,
  onOpen,
  onNewFile,
  onNewFolder,
  onDownload,
  onRename,
  onDelete,
  onAddFavorite,
  isFavorite,
}) {
  if (!menu) return null;
  const { x, y, entry } = menu;
  const isDirectory = entry.isDirectory;
  return React.createElement(
    "div",
    {
      ref: menuRef,
      className: "files-context-menu",
      role: "menu",
      style: { left: x, top: y },
      onContextMenu: (event) => event.preventDefault(),
    },
    React.createElement(
      "button",
      { type: "button", role: "menuitem", onClick: () => onOpen(entry) },
      React.createElement(isDirectory ? FolderOpen : Play, {
        size: 14,
        "aria-hidden": true,
      }),
      React.createElement(
        "span",
        null,
        isDirectory ? "Open folder" : "Open file",
      ),
    ),
    !isDirectory &&
      React.createElement(
        "button",
        { type: "button", role: "menuitem", onClick: () => onDownload(entry) },
        React.createElement(Download, { size: 14, "aria-hidden": true }),
        React.createElement("span", null, "Download"),
      ),
    isDirectory &&
      React.createElement(
        React.Fragment,
        null,
        React.createElement("div", { className: "files-context-menu-sep" }),
        React.createElement(
          "button",
          { type: "button", role: "menuitem", onClick: () => onNewFile(entry) },
          React.createElement(FilePlus2, { size: 14, "aria-hidden": true }),
          React.createElement("span", null, "New file here"),
        ),
        React.createElement(
          "button",
          {
            type: "button",
            role: "menuitem",
            onClick: () => onNewFolder(entry),
          },
          React.createElement(FolderPlus, { size: 14, "aria-hidden": true }),
          React.createElement("span", null, "New folder here"),
        ),
      ),
    React.createElement(
      "button",
      {
        type: "button",
        role: "menuitem",
        onClick: () => onAddFavorite(entry),
        disabled: isFavorite,
      },
      React.createElement(Star, { size: 14, "aria-hidden": true }),
      React.createElement(
        "span",
        null,
        isFavorite ? "Already in Favorites" : "Add to Favorites",
      ),
    ),
    React.createElement("div", { className: "files-context-menu-sep" }),
    React.createElement(
      "button",
      { type: "button", role: "menuitem", onClick: () => onRename(entry) },
      React.createElement(Pencil, { size: 14, "aria-hidden": true }),
      React.createElement("span", null, "Rename"),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        role: "menuitem",
        className: "files-context-menu-danger",
        onClick: () => onDelete(entry),
      },
      React.createElement(Trash2, { size: 14, "aria-hidden": true }),
      React.createElement("span", null, "Delete"),
    ),
  );
}
