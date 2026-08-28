// files-favorites-ui.js — the macOS Finder-style Favorites sidebar:
// persisted shortcuts to directories and files the user pinned. Split
// out of files-ui.js when that module crossed the 500-line rule.
import React from "react";
import {
  Box,
  ChevronRight,
  FolderHeart,
  HardDrive,
  Home,
  X,
} from "lucide-react";
import { getEntryIcon } from "./files-ui.js?v=20260826.38";
// File favorites get their extension icon; directories keep the special
// id-based icons (Home / root / mounts) or a plain folder.
export function getFavoriteIcon(favorite) {
  if (favorite.isDirectory === false) {
    const name = String(favorite.label || favorite.path || "").split("/").pop();
    return getEntryIcon(name, false, null);
  }
  if (favorite.id === "home") return Home;
  if (favorite.id === "root") return Box;
  if (favorite.id === "mnt") return HardDrive;
  return FolderHeart;
}

function renderFavoritesHeader({ collapsed, onToggle }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "files-sidebar-toggle files-section-header",
      onClick: onToggle,
      "aria-expanded": !collapsed,
      title: collapsed ? "Expand Favorites" : "Collapse Favorites",
    },
    React.createElement(ChevronRight, {
      size: 13,
      className: collapsed ? "" : "open",
      "aria-hidden": true,
    }),
    React.createElement(
      "span",
      { className: "files-volumes-title" },
      "Favorites",
    ),
  );
}

// Favorite paths may carry a leading slash while the panel's current
// path is canonical; compare normalized forms so the active highlight
// works either way. File favorites are not directories, so the
// current-folder prefix rule never marks them active.
function isFavoriteActive(favorite, currentPath) {
  const cur = String(currentPath).replace(/^\/+/, "");
  const fav = String(favorite.path).replace(/^\/+/, "");
  return favorite.isDirectory !== false && (cur === fav ||
    (fav !== "." && cur.startsWith(`${fav}/`)));
}

function renderFavoriteRow({ favorite, currentPath, onOpen, onRemove }) {
  const FavoriteIcon = getFavoriteIcon(favorite);
  const active = isFavoriteActive(favorite, currentPath);
  return React.createElement(
    "div",
    {
      key: favorite.id,
      className: `files-favorite${active ? " files-favorite-active" : ""}`,
    },
    React.createElement(
      "button",
      {
        type: "button",
        className: "files-favorite-name",
        title: favorite.path === "." ? "Go to root" : `/${favorite.path}`,
        onClick: () => onOpen(favorite),
      },
      React.createElement(FavoriteIcon, {
        size: 14,
        "aria-hidden": true,
      }),
      React.createElement("span", null, favorite.label),
    ),
    React.createElement("button", {
      type: "button",
      className: "files-favorite-remove",
      title: `Remove ${favorite.label} from favorites`,
      "aria-label": `Remove ${favorite.label} from favorites`,
      onClick: () => onRemove(favorite.id),
    }, React.createElement(X, { size: 12, "aria-hidden": true })),
  );
}

export function FavoritesSidebar({
  favorites,
  currentPath,
  onOpen,
  onRemove,
  collapsed = false,
  onToggle,
}) {
  return React.createElement(
    "div",
    { className: "files-section" },
    renderFavoritesHeader({ collapsed, onToggle }),
    !collapsed &&
      (favorites.length === 0
        ? React.createElement(
          "p",
          { className: "files-volumes-empty" },
          "No favorites.",
        )
        : React.createElement(
          "div",
          { className: "files-favorites-list" },
          favorites.map((favorite) =>
            renderFavoriteRow({ favorite, currentPath, onOpen, onRemove })
          ),
        )),
  );
}
