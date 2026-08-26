// files-ui.js — presentational UI bits for the Files panel that are
// independent of the filesystem: the per-extension icon map, the
// clickable path breadcrumb and the right-click context menu. Kept
// separate from files-parts.js so neither file outgrows the 500-line
// rule.
import React, { useState } from "react";
import {
  Box,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  FileVideo,
  FolderHeart,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  Image,
  Pencil,
  Play,
  Star,
  Trash2,
  X,
} from "lucide-react";

// === Entry icons (per file extension) ===

const FILE_EXTENSION_ICONS = {
  png: Image, jpg: Image, jpeg: Image, gif: Image, webp: Image,
  svg: Image, bmp: Image, ico: Image,
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio,
  m4a: FileAudio, aac: FileAudio,
  mp4: FileVideo, webm: FileVideo, mov: FileVideo, mkv: FileVideo,
  pdf: FileText, md: FileText, txt: FileText, log: FileText,
  json: FileJson,
  zip: FileArchive, tar: FileArchive, gz: FileArchive, tgz: FileArchive,
  "7z": FileArchive, rar: FileArchive,
};
const CODE_FILE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "html", "css", "py", "rs",
  "go", "c", "h", "cpp", "sh", "bash", "toml", "yaml", "yml", "xml",
  "wasm", "wat", "sql", "rb", "java", "kt", "scala", "php", "lua",
]);

export function getEntryIcon(name, isDirectory, iconKind) {
  if (isDirectory) return FolderOpen;
  if (iconKind === "wasm") return FileCode2;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (CODE_FILE_EXTENSIONS.has(ext)) return FileCode2;
  return FILE_EXTENSION_ICONS[ext] || File;
}

// === Breadcrumb ===

export function FilesBreadcrumb({ path, onNavigate }) {
  const parts = path === "." ? [] : path.split("/").filter(Boolean);
  const segments = [{ label: "/", target: "." }];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    segments.push({ label: part, target: acc });
  }
  return React.createElement(
    "div",
    { className: "files-breadcrumb", "aria-label": "Current path" },
    segments.map((segment, index) =>
      React.createElement(
        React.Fragment,
        { key: `${index}:${segment.target}` },
        index > 1 &&
          React.createElement(
            "span",
            { className: "files-breadcrumb-sep", "aria-hidden": true },
            "/",
          ),
        index === segments.length - 1
          ? React.createElement(
            "span",
            { className: "files-breadcrumb-current" },
            segment.label,
          )
          : React.createElement(
            "button",
            {
              type: "button",
              title: segment.target === "."
                ? "Go to root"
                : `Go to /${segment.target}`,
              onClick: () => onNavigate(segment.target),
            },
            segment.label,
          ),
      )
    ),
  );
}

// === Favorites sidebar (macOS Finder style) ===

export function getFavoriteIcon(id) {
  if (id === "home") return Home;
  if (id === "root") return Box;
  if (id === "mnt") return HardDrive;
  return FolderHeart;
}

export function FavoritesSidebar({ favorites, currentPath, onOpen, onRemove }) {
  return React.createElement(
    "div",
    { className: "files-favorites" },
    React.createElement(
      "div",
      { className: "files-volumes-header" },
      React.createElement(
        "span",
        { className: "files-volumes-title" },
        "Favorites",
      ),
    ),
    favorites.length === 0
      ? React.createElement(
        "p",
        { className: "files-volumes-empty" },
        "No favorites.",
      )
      : React.createElement(
        "div",
        { className: "files-favorites-list" },
        favorites.map((favorite) => {
          const FavoriteIcon = getFavoriteIcon(favorite.id);
          const active = currentPath === favorite.path ||
            (favorite.path !== "." && currentPath.startsWith(`${favorite.path}/`));
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
                title: favorite.path === "." ? "Go to root" : `Go to /${favorite.path}`,
                onClick: () => onOpen(favorite.path),
              },
              React.createElement(FavoriteIcon, { size: 14, "aria-hidden": true }),
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
      ),
  );
}

// === Info pane (metadata for a single-click selection) ===

export function formatFileSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = "KB";
  for (const next of units) {
    if (value < 1024 || next === "TB") {
      unit = next;
      break;
    }
    value /= 1024;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

export function formatModTime(value) {
  if (!value) return "—";
  const ms = typeof value === "number" && value < 1e12
    ? value * 1000
    : new Date(value).getTime();
  return new Date(ms).toLocaleString();
}

const PREVIEW_KIND_LABELS = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
};

export function FilesInfoPane({ info, onOpenChild, gridView }) {
  if (!info) return null;
  const Icon = getEntryIcon(info.name, info.isDirectory, info.iconKind);
  const pathText = `/${String(info.path).replace(/^\/+/, "")}`;
  const typeLabel = info.isDirectory
    ? "Directory"
    : info.iconKind === "wasm"
    ? "WebAssembly"
    : PREVIEW_KIND_LABELS[info.previewKind] || "File";
  return React.createElement(
    "div",
    { className: "files-info" },
    info.preview
      ? React.createElement(
        "div",
        { className: `files-info-preview ${info.preview.kind}` },
        info.preview.kind === "image"
          ? React.createElement("img", {
            src: info.preview.url,
            alt: info.name,
          })
          : info.preview.kind === "audio"
          ? React.createElement("audio", {
            src: info.preview.url,
            controls: true,
            preload: "metadata",
          })
          : info.preview.kind === "video"
          ? React.createElement("video", {
            src: info.preview.url,
            controls: true,
            preload: "metadata",
          })
          : React.createElement("iframe", {
            src: info.preview.url,
            title: "PDF preview",
          }),
      )
      : info.textPreview != null
      ? React.createElement(
        "pre",
        { className: "files-info-text-preview" },
        info.textPreview,
      )
      : info.isDirectory && info.children
      ? gridView
        ? React.createElement(
          "div",
          { className: "files-info-grid" },
          info.children.map((child) => {
            const ChildIcon = getEntryIcon(
              child.name,
              child.isDirectory,
              child.iconKind,
            );
            return React.createElement(
              "button",
              {
                key: child.name,
                type: "button",
                className: child.isDirectory
                  ? "files-info-grid-item dir"
                  : "files-info-grid-item",
                title: child.isDirectory ? `${child.name}/` : child.name,
                onClick: onOpenChild
                  ? () => onOpenChild(child)
                  : undefined,
              },
              React.createElement(ChildIcon, {
                size: 22,
                "aria-hidden": true,
              }),
              React.createElement("span", null, child.name),
            );
          }),
          info.childrenTotal > info.children.length &&
            React.createElement(
              "p",
              { className: "files-info-children-more" },
              `… and ${info.childrenTotal - info.children.length} more`,
            ),
        )
        : React.createElement(
          "div",
          { className: "files-info-children" },
          info.children.map((child) => {
            const ChildIcon = getEntryIcon(
              child.name,
              child.isDirectory,
              child.iconKind,
            );
            return React.createElement(
              "button",
              {
                key: child.name,
                type: "button",
                className: child.isDirectory
                  ? "files-info-child dir"
                  : "files-info-child",
                title: child.isDirectory ? `${child.name}/` : child.name,
                onClick: onOpenChild
                  ? () => onOpenChild(child)
                  : undefined,
              },
              React.createElement(ChildIcon, { size: 13, "aria-hidden": true }),
              React.createElement("span", null, child.name),
            );
          }),
          info.childrenTotal > info.children.length &&
            React.createElement(
              "p",
              { className: "files-info-children-more" },
              `… and ${info.childrenTotal - info.children.length} more`,
            ),
        )
      : React.createElement(
        "div",
        { className: "files-info-icon" },
        React.createElement(Icon, { size: 36, "aria-hidden": true }),
      ),
    React.createElement(
      "h2",
      { className: "files-info-name", title: info.name },
      info.name,
    ),
    React.createElement(
      "p",
      { className: "files-info-type" },
      typeLabel,
    ),
    React.createElement(
      "dl",
      { className: "files-info-list" },
      React.createElement("dt", null, "Path"),
      React.createElement("dd", null, pathText),
      !info.isDirectory &&
        React.createElement(React.Fragment, null,
          React.createElement("dt", null, "Size"),
          React.createElement("dd", null, formatFileSize(info.size))),
      info.isDirectory && info.entries != null &&
        React.createElement(React.Fragment, null,
          React.createElement("dt", null, "Items"),
          React.createElement(
            "dd",
            null,
            `${info.entries} item${info.entries === 1 ? "" : "s"}`,
          )),
      React.createElement("dt", null, "Modified"),
      React.createElement(
        "dd",
        null,
        formatModTime(info.modTime),
      ),
    ),
  );
}

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
      React.createElement("span", null, isDirectory ? "Open folder" : "Open file"),
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
          { type: "button", role: "menuitem", onClick: () => onNewFolder(entry) },
          React.createElement(FolderPlus, { size: 14, "aria-hidden": true }),
          React.createElement("span", null, "New folder here"),
        ),
      ),
    isDirectory &&
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
