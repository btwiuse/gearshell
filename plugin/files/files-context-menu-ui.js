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

function menuItem({ icon, label, onClick, danger, disabled }) {
  return React.createElement(
    "button",
    {
      type: "button",
      role: "menuitem",
      ...(danger && { className: "files-context-menu-danger" }),
      ...(disabled && { disabled }),
      onClick,
    },
    React.createElement(icon, { size: 14, "aria-hidden": true }),
    React.createElement("span", null, label),
  );
}

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
  const mi = (label, icon, onClick, extra = {}) =>
    menuItem({ icon, label, onClick, ...extra });
  const sep = () =>
    React.createElement("div", { className: "files-context-menu-sep" });
  return React.createElement(
    "div",
    {
      ref: menuRef,
      className: "files-context-menu",
      role: "menu",
      style: { left: x, top: y },
      onContextMenu: (event) => event.preventDefault(),
    },
    mi(
      isDirectory ? "Open folder" : "Open file",
      isDirectory ? FolderOpen : Play,
      () => onOpen(entry),
    ),
    !isDirectory &&
      mi("Download", Download, () => onDownload(entry)),
    isDirectory &&
      React.createElement(
        React.Fragment,
        null,
        sep(),
        mi("New file here", FilePlus2, () => onNewFile(entry)),
        mi("New folder here", FolderPlus, () => onNewFolder(entry)),
      ),
    mi(
      isFavorite ? "Already in Favorites" : "Add to Favorites",
      Star,
      () => onAddFavorite(entry),
      { disabled: isFavorite },
    ),
    sep(),
    mi("Rename", Pencil, () => onRename(entry)),
    mi("Delete", Trash2, () => onDelete(entry), { danger: true }),
  );
}
