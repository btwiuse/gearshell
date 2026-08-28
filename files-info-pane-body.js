// files-info-pane-body.js — the Files info pane's body renderers
// (toolbar, grid/list children, preview, footer), split out of
// files-info-pane.js for the 500-line rule.
import React from "react";
import { ArrowDown, ArrowUp, LayoutGrid, List } from "lucide-react";
import { getEntryIcon } from "./files-ui.js?v=20260826.38";
import {
  formatFileSize,
  formatModTime,
  formatModTimeColumn,
} from "./files-info.js?v=20260826.41";

const PREVIEW_KIND_LABELS = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
};

export function childTypeLabel(child) {
  return child.isDirectory
    ? "Directory"
    : child.iconKind === "wasm"
    ? "WebAssembly"
    : "File";
}

export function entryTypeLabel(info) {
  return info.isDirectory
    ? "Directory"
    : info.iconKind === "wasm"
    ? "WebAssembly"
    : PREVIEW_KIND_LABELS[info.previewKind] || "File";
}

// Explorer semantics: single click selects (in-place highlight),
// double click opens — directories enter, files open in the editor.
// Touch has no double-click, so a single tap opens (like the tree).
export function makeChildInteraction({
  child,
  finePointer,
  onOpenChild,
  onSelectChild,
  setSelectedChild,
}) {
  return {
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
  };
}

function viewButton(
  { mode, active, title, label, BodyIcon, onViewModeChange },
) {
  return React.createElement(
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
}

function sortHeaderButton({ by, label, sort, onSortChange }) {
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
}

function startColResize(event, col, columnWidths, onColumnWidthChange) {
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
}

function colResizer(col, columnWidths, onColumnWidthChange) {
  return React.createElement("span", {
    className: "files-info-col-resizer",
    "aria-hidden": true,
    onPointerDown: (event) =>
      startColResize(event, col, columnWidths, onColumnWidthChange),
    onClick: (event) => event.stopPropagation(),
  });
}

function renderSortControls({ sort, onSortChange }) {
  return React.createElement(
    "div",
    { className: "files-info-toolbar-group files-info-sort" },
    React.createElement(
      "select",
      {
        className: "files-info-sort-select",
        value: sort.by,
        "aria-label": "Sort by",
        onChange: (event) => onSortChange({ ...sort, by: event.target.value }),
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
  );
}

export function renderViewToolbar(
  { viewMode, sort, onViewModeChange, onSortChange },
) {
  const isGrid = viewMode === "grid";
  return React.createElement(
    "div",
    { className: "files-info-toolbar" },
    React.createElement(
      "div",
      {
        className: "files-info-toolbar-group",
        role: "group",
        "aria-label": "View mode",
      },
      viewButton({
        mode: "grid",
        active: isGrid,
        title: "Grid view",
        label: "Grid view",
        BodyIcon: LayoutGrid,
        onViewModeChange,
      }),
      viewButton({
        mode: "list",
        active: !isGrid,
        title: "List view",
        label: "List view",
        BodyIcon: List,
        onViewModeChange,
      }),
    ),
    renderSortControls({ sort, onSortChange }),
  );
}

function renderChildrenMore(childrenTotal, children, className) {
  return childrenTotal > children.length &&
    React.createElement(
      "p",
      { className },
      `… and ${childrenTotal - children.length} more`,
    );
}

export function renderGridItems({
  children,
  selectedChild,
  makeInteraction,
  childrenTotal,
  loading,
}) {
  return React.createElement(
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
          ...makeInteraction(child),
        },
        React.createElement(ChildIcon, {
          size: 26,
          "aria-hidden": true,
        }),
        React.createElement("span", null, child.name),
      );
    }),
    renderChildrenMore(childrenTotal, children, "files-info-children-more"),
    loading
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
  );
}

function renderListHeader({
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
}) {
  return React.createElement(
    "div",
    { className: "files-info-table-header" },
    React.createElement("div", {
      className: "files-info-col files-info-col-icon",
      "aria-hidden": true,
    }),
    sortHeaderButton({ by: "name", label: "Name", sort, onSortChange }),
    React.createElement(
      "div",
      { className: "files-info-col-wrap files-info-col-mtime" },
      sortHeaderButton({
        by: "modified",
        label: "Modified",
        sort,
        onSortChange,
      }),
      colResizer("mtime", columnWidths, onColumnWidthChange),
    ),
    React.createElement(
      "div",
      { className: "files-info-col-wrap files-info-col-size" },
      sortHeaderButton({ by: "size", label: "Size", sort, onSortChange }),
      colResizer("size", columnWidths, onColumnWidthChange),
    ),
  );
}

function renderListRow(child, selectedChild, makeInteraction) {
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
        child.isDirectory ? "files-info-child dir" : "files-info-child"
      }${selectedChild === child ? " selected" : ""}`,
      title: child.isDirectory ? `${child.name}/` : child.name,
      ...makeInteraction(child),
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
}

export function renderListItems({
  children,
  selectedChild,
  makeInteraction,
  childrenTotal,
  loading,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
}) {
  return React.createElement(
    "div",
    { className: "files-info-children" },
    renderListHeader({ sort, onSortChange, columnWidths, onColumnWidthChange }),
    children.map((child) =>
      renderListRow(child, selectedChild, makeInteraction)
    ),
    renderChildrenMore(childrenTotal, children, "files-info-children-more"),
    !loading && children.length === 0 &&
      React.createElement(
        "p",
        { className: "files-info-children-empty" },
        "Empty folder.",
      ),
  );
}

function renderMediaPreview(preview, name) {
  if (preview.kind === "image") {
    return React.createElement("img", { src: preview.url, alt: name });
  }
  if (preview.kind === "audio") {
    return React.createElement("audio", {
      src: preview.url,
      controls: true,
      preload: "metadata",
    });
  }
  if (preview.kind === "video") {
    return React.createElement("video", {
      src: preview.url,
      controls: true,
      preload: "metadata",
    });
  }
  return React.createElement("iframe", {
    src: preview.url,
    title: "PDF preview",
  });
}

export function renderPreviewBody({
  info,
  isGrid,
  makeInteraction,
  selectedChild,
  showChildren,
}) {
  const children = showChildren ? info.children : [];
  if (info.preview) {
    return React.createElement(
      "div",
      { className: `files-info-preview ${info.preview.kind}` },
      renderMediaPreview(info.preview, info.name),
    );
  }
  if (info.textPreview != null) {
    return React.createElement(
      "pre",
      { className: "files-info-text-preview" },
      info.textPreview,
    );
  }
  if (!showChildren) {
    const Icon = getEntryIcon(info.name, info.isDirectory, info.iconKind);
    return React.createElement(
      "div",
      { className: "files-info-icon" },
      React.createElement(Icon, { size: 36, "aria-hidden": true }),
    );
  }
  const childrenTotal = info.childrenTotal ?? children.length;
  return isGrid
    ? renderGridItems({
      children,
      selectedChild,
      makeInteraction,
      childrenTotal,
      loading: info.loading,
    })
    : renderListItems({
      children,
      selectedChild,
      makeInteraction,
      childrenTotal,
      loading: info.loading,
      sort: info.sort,
      onSortChange: info.onSortChange,
      columnWidths: info.columnWidths,
      onColumnWidthChange: info.onColumnWidthChange,
    });
}

function metadataRow(dt, dd) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("dt", null, dt),
    React.createElement("dd", null, dd),
  );
}

function renderMetadataList({ info, selectedChild, basePathText }) {
  const target = selectedChild || info;
  return React.createElement(
    "dl",
    { className: "files-info-list" },
    metadataRow(
      "Path",
      selectedChild
        ? `/${[basePathText, selectedChild.name].filter(Boolean).join("/")}`
        : `/${basePathText}`,
    ),
    !target.isDirectory &&
      metadataRow("Size", formatFileSize(target.size)),
    !selectedChild && info.isDirectory && info.entries != null &&
      metadataRow(
        "Items",
        `${info.entries} item${info.entries === 1 ? "" : "s"}`,
      ),
    metadataRow("Modified", formatModTime(target.modTime)),
  );
}

export function renderInfoFooter(
  { info, selectedChild, basePathText, typeLabel },
) {
  return React.createElement(
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
    renderMetadataList({ info, selectedChild, basePathText }),
  );
}
