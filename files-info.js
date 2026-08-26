// files-info.js — the Files panel's info pane, laid out like a mini
// page: a view/sort toolbar on top, the contents (media preview, text
// excerpt, or the directory listing tiled edge-to-edge) as the scrolling
// body, and the entry metadata in a footer strip. Split out of
// files-ui.js when that module crossed the 500-line rule.
import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, List } from "lucide-react";
import { getEntryIcon } from "./files-ui.js?v=20260826.36";
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

// Column formatter for list rows: fixed-width YYYY-MM-DD hh:mm:ss so
// the modified column stays aligned and unambiguous.
export function formatModTimeColumn(value) {
  if (!value) return "";
  const ms = typeof value === "number" && value < 1e12
    ? value * 1000
    : new Date(value).getTime();
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const PREVIEW_KIND_LABELS = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
};

// Sort the children shown in the info pane: directories stay grouped
// first (Explorer-style), then entries sort by the chosen key. Missing
// size / modified values always sink to the end so partial data does
// not scramble the order.
export function sortFilesEntries(children, { by = "name", desc = false } = {}) {
  if (!children) return children;
  const factor = desc ? -1 : 1;
  const key = by === "size" ? "size" : by === "modified" ? "modTime" : "name";
  return [...children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const av = a[key];
    const bv = b[key];
    if (av == null || bv == null) {
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      return av == null ? 1 : -1;
    }
    const cmp = key === "name" ? String(av).localeCompare(String(bv)) : av - bv;
    return factor * cmp;
  });
}

// The info pane is laid out like a mini page: a view/sort toolbar on
// top, the contents (media preview, text excerpt, or the directory
// listing tiled edge-to-edge) as the scrolling body, and the entry
// metadata in a footer strip at the bottom.
export function FilesInfoPane({
  info,
  onOpenChild,
  onSelectChild,
  finePointer = true,
  viewMode = "grid",
  onViewModeChange,
  sort = { by: "name", desc: false },
  onSortChange,
  columnWidths = { size: 80, mtime: 164 },
  onColumnWidthChange,
}) {
  // Selection is in-pane: single-clicking a tile highlights it and the
  // footer shows its details, while the grid stays put so a double
  // click reliably reaches the same tile (click-to-open would unmount
  // the tile before the second click lands).
  const [selectedChild, setSelectedChild] = useState(null);
  useEffect(() => {
    setSelectedChild(null);
  }, [info && info.path]);
  if (!info) return null;
  const Icon = getEntryIcon(info.name, info.isDirectory, info.iconKind);
  const basePathText = String(info.path).replace(/^\/+/, "").replace(/^\.$/, "")
    .replace(/\/+$/, "");
  const pathText = `/${basePathText}`;
  const typeLabel = info.isDirectory
    ? "Directory"
    : info.iconKind === "wasm"
    ? "WebAssembly"
    : PREVIEW_KIND_LABELS[info.previewKind] || "File";
  const showChildren = info.isDirectory && info.children != null;
  const children = showChildren ? sortFilesEntries(info.children, sort) : [];
  const isGrid = viewMode === "grid";
  const childTypeLabel = (child) =>
    child.isDirectory
      ? "Directory"
      : child.iconKind === "wasm"
      ? "WebAssembly"
      : "File";
  // Explorer semantics: single click selects (in-place highlight),
  // double click opens — directories enter, files open in the editor.
  // Touch has no double-click, so a single tap opens (like the tree).
  const childInteraction = (child) => ({
    onClick: finePointer
      ? () => {
        setSelectedChild(child);
        if (onSelectChild) onSelectChild(child);
      }
      : onOpenChild
      ? () => onOpenChild(child)
      : undefined,
    onDoubleClick: finePointer && onOpenChild
      ? () => onOpenChild(child)
      : undefined,
    onKeyDown: (event) => {
      if (event.key === "Enter" && onOpenChild) {
        event.preventDefault();
        onOpenChild(child);
      }
    },
  });
  const viewButton = (mode, active, title, label, BodyIcon) =>
    React.createElement(
      "button",
      {
        type: "button",
        className: active ? "files-info-tool active" : "files-info-tool",
        title,
        "aria-label": label,
        "aria-pressed": active,
        onClick: () => onViewModeChange(mode),
      },
      React.createElement(BodyIcon, { size: 15, "aria-hidden": true }),
    );
  const sortHeaderButton = (by, label) => {
    const active = sort.by === by;
    return React.createElement(
      "button",
      {
        type: "button",
        className: `files-info-col files-info-col-${by}${
          active ? " active" : ""
        }`,
        "aria-pressed": active,
        title: `Sort by ${label}`,
        onClick: () => onSortChange({ by, desc: active ? !sort.desc : false }),
      },
      label,
      active &&
        React.createElement(sort.desc ? ArrowDown : ArrowUp, {
          size: 11,
          "aria-hidden": true,
        }),
    );
  };
  const colResizeStart = (event, col) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[col];
    const onMove = (e) => {
      onColumnWidthChange({
        ...columnWidths,
        [col]: Math.max(48, startWidth + e.clientX - startX),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const colResizer = (col) =>
    React.createElement("span", {
      className: "files-info-col-resizer",
      "aria-hidden": true,
      onPointerDown: (event) => colResizeStart(event, col),
      onClick: (event) => event.stopPropagation(),
    });
  return React.createElement(
    "div",
    {
      className: "files-info",
      style: {
        "--files-col-size": `${columnWidths.size}px`,
        "--files-col-mtime": `${columnWidths.mtime}px`,
      },
    },
    showChildren &&
      React.createElement(
        "div",
        { className: "files-info-toolbar" },
        React.createElement(
          "div",
          {
            className: "files-info-toolbar-group",
            role: "group",
            "aria-label": "View mode",
          },
          viewButton("grid", isGrid, "Grid view", "Grid view", LayoutGrid),
          viewButton("list", !isGrid, "List view", "List view", List),
        ),
        React.createElement(
          "div",
          { className: "files-info-toolbar-group files-info-sort" },
          React.createElement(
            "select",
            {
              className: "files-info-sort-select",
              value: sort.by,
              "aria-label": "Sort by",
              onChange: (event) =>
                onSortChange({ ...sort, by: event.target.value }),
            },
            React.createElement("option", { value: "name" }, "Name"),
            React.createElement("option", { value: "size" }, "Size"),
            React.createElement("option", { value: "modified" }, "Modified"),
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "files-info-tool",
              title: sort.desc ? "Sort descending" : "Sort ascending",
              "aria-label": "Sort direction",
              "aria-pressed": sort.desc,
              onClick: () => onSortChange({ ...sort, desc: !sort.desc }),
            },
            React.createElement(
              sort.desc ? ArrowDown : ArrowUp,
              { size: 15, "aria-hidden": true },
            ),
          ),
        ),
      ),
    React.createElement(
      "div",
      { className: "files-info-body" },
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
        : showChildren
        ? isGrid
          ? React.createElement(
            "div",
            { className: "files-info-grid" },
            children.map((child) => {
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
                  className: `${
                    child.isDirectory
                      ? "files-info-grid-item dir"
                      : "files-info-grid-item"
                  }${selectedChild === child ? " selected" : ""}`,
                  title: child.isDirectory ? `${child.name}/` : child.name,
                  ...childInteraction(child),
                },
                React.createElement(ChildIcon, {
                  size: 26,
                  "aria-hidden": true,
                }),
                React.createElement("span", null, child.name),
              );
            }),
            info.childrenTotal > children.length &&
              React.createElement(
                "p",
                { className: "files-info-children-more" },
                `… and ${info.childrenTotal - children.length} more`,
              ),
            info.loading
              ? React.createElement(
                "p",
                { className: "files-info-grid-note" },
                "Loading…",
              )
              : children.length === 0 &&
                React.createElement(
                  "p",
                  { className: "files-info-grid-note" },
                  "Empty folder.",
                ),
          )
          : React.createElement(
            "div",
            { className: "files-info-children" },
            React.createElement(
              "div",
              { className: "files-info-table-header" },
              React.createElement("div", {
                className: "files-info-col files-info-col-icon",
                "aria-hidden": true,
              }),
              sortHeaderButton("name", "Name"),
              React.createElement(
                "div",
                { className: "files-info-col-wrap files-info-col-mtime" },
                sortHeaderButton("modified", "Modified"),
                colResizer("mtime"),
              ),
              React.createElement(
                "div",
                { className: "files-info-col-wrap files-info-col-size" },
                sortHeaderButton("size", "Size"),
                colResizer("size"),
              ),
            ),
            children.map((child) => {
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
                  className: `${
                    child.isDirectory
                      ? "files-info-child dir"
                      : "files-info-child"
                  }${selectedChild === child ? " selected" : ""}`,
                  title: child.isDirectory ? `${child.name}/` : child.name,
                  ...childInteraction(child),
                },
                React.createElement(ChildIcon, {
                  size: 13,
                  "aria-hidden": true,
                }),
                React.createElement(
                  "span",
                  { className: "files-info-child-name" },
                  child.name,
                ),
                React.createElement(
                  "span",
                  { className: "files-info-child-mtime" },
                  child.isDirectory ? "" : formatModTimeColumn(child.modTime),
                ),
                React.createElement(
                  "span",
                  { className: "files-info-child-size" },
                  child.isDirectory ? "" : formatFileSize(child.size),
                ),
              );
            }),
            info.childrenTotal > children.length &&
              React.createElement(
                "p",
                { className: "files-info-children-more" },
                `… and ${info.childrenTotal - children.length} more`,
              ),
            !info.loading && children.length === 0 &&
              React.createElement(
                "p",
                { className: "files-info-children-empty" },
                "Empty folder.",
              ),
          )
        : React.createElement(
          "div",
          { className: "files-info-icon" },
          React.createElement(Icon, { size: 36, "aria-hidden": true }),
        ),
    ),
    React.createElement(
      "footer",
      { className: "files-info-footer" },
      React.createElement(
        "div",
        { className: "files-info-heading" },
        React.createElement(
          "h2",
          {
            className: "files-info-name",
            title: selectedChild ? selectedChild.name : info.name,
          },
          selectedChild ? selectedChild.name : info.name,
        ),
        React.createElement(
          "p",
          { className: "files-info-type" },
          selectedChild ? childTypeLabel(selectedChild) : typeLabel,
        ),
      ),
      React.createElement(
        "dl",
        { className: "files-info-list" },
        React.createElement("dt", null, "Path"),
        React.createElement(
          "dd",
          null,
          selectedChild
            ? `/${[basePathText, selectedChild.name].filter(Boolean).join("/")}`
            : pathText,
        ),
        (selectedChild ? !selectedChild.isDirectory : !info.isDirectory) &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement("dt", null, "Size"),
            React.createElement(
              "dd",
              null,
              formatFileSize(selectedChild ? selectedChild.size : info.size),
            ),
          ),
        !selectedChild && info.isDirectory && info.entries != null &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement("dt", null, "Items"),
            React.createElement(
              "dd",
              null,
              `${info.entries} item${info.entries === 1 ? "" : "s"}`,
            ),
          ),
        React.createElement("dt", null, "Modified"),
        React.createElement(
          "dd",
          null,
          formatModTime(selectedChild ? selectedChild.modTime : info.modTime),
        ),
      ),
    ),
  );
}
