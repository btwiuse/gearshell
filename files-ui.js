// files-ui.js — presentational UI bits for the Files panel that are
// independent of the filesystem: the per-extension icon map and the
// clickable path breadcrumb. The info pane, favorites sidebar and
// context menu grew this module past the 500-line rule and moved to
// files-info.js / files-favorites-ui.js / files-context-menu-ui.js.
import React from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileJson,
  FileText,
  FileVideo,
  FolderOpen,
  Image,
} from "lucide-react";

// === Entry icons (per file extension) ===

const FILE_EXTENSION_ICONS = {
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  svg: Image,
  bmp: Image,
  ico: Image,
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  m4a: FileAudio,
  aac: FileAudio,
  mp4: FileVideo,
  webm: FileVideo,
  mov: FileVideo,
  mkv: FileVideo,
  pdf: FileText,
  md: FileText,
  txt: FileText,
  log: FileText,
  json: FileJson,
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  tgz: FileArchive,
  "7z": FileArchive,
  rar: FileArchive,
};
const CODE_FILE_EXTENSIONS = new Set([
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "html",
  "css",
  "py",
  "rs",
  "go",
  "c",
  "h",
  "cpp",
  "sh",
  "bash",
  "toml",
  "yaml",
  "yml",
  "xml",
  "wasm",
  "wat",
  "sql",
  "rb",
  "java",
  "kt",
  "scala",
  "php",
  "lua",
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
