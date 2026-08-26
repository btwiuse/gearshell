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
    { className: "files-favorites" },
    React.createElement(
      "div",
      { className: "files-volumes-header" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "files-sidebar-toggle",
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
      ),
    ),
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
          favorites.map((favorite) => {
            const FavoriteIcon = getFavoriteIcon(favorite);
            // Favorite paths may carry a leading slash while the panel's
            // current path is canonical; compare normalized forms so the
            // active highlight works either way. File favorites are not
            // directories, so the current-folder prefix rule never marks
            // them active.
            const cur = String(currentPath).replace(/^\/+/, "");
            const fav = String(favorite.path).replace(/^\/+/, "");
            const active = favorite.isDirectory !== false && (cur === fav ||
              (fav !== "." && cur.startsWith(`${fav}/`)));
            return React.createElement(
              "div",
              {
                key: favorite.id,
                className: `files-favorite${
                  active ? " files-favorite-active" : ""
                }`,
              },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "files-favorite-name",
                  title: favorite.path === "."
                    ? "Go to root"
                    : `/${favorite.path}`,
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
          }),
        )),
  );
}
