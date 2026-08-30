// files-info-pane-body.js — the Files info pane's body renderers
// (toolbar, grid/list children, preview, footer), split out of
// files-info-pane.js for the 500-line rule.
import React from "react";
import { ArrowDown, ArrowUp, LayoutGrid, List } from "lucide-react";
import { getEntryIcon } from "./files-ui.js";
import htm from "htm";

const html = htm.bind(React.createElement);
import {
  formatFileSize,
  formatModTime,
  formatModTimeColumn,
} from "./files-info.js";

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
  return html`
    <button
      type="button"
      className=${active ? "files-info-tool active" : "files-info-tool"}
      title=${title}
      aria-label=${label}
      aria-pressed=${active}
      onClick=${() => onViewModeChange(mode)}
    >
      <${BodyIcon} size=${15} aria-hidden=${true}/>
    </button>
  `;
}

function sortHeaderButton({ by, label, sort, onSortChange }) {
  const active = sort.by === by;
  return html`
    <button
      type="button"
      className=${`files-info-col files-info-col-${by}${
        active ? " active" : ""
      }`}
      aria-pressed=${active}
      title=${`Sort by ${label}`}
      onClick=${() => onSortChange({ by, desc: active ? !sort.desc : false })}
    >
      ${label}
      ${active &&
        html`<${sort.desc ? ArrowDown : ArrowUp} size=${11} aria-hidden=${true}/>`}
    </button>
  `;
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
  return html`
    <span
      className="files-info-col-resizer"
      aria-hidden=${true}
      onPointerDown=${(event) =>
        startColResize(event, col, columnWidths, onColumnWidthChange)}
      onClick=${(event) => event.stopPropagation()}
    ></span>
  `;
}

function renderSortControls({ sort, onSortChange }) {
  return html`
    <div className="files-info-toolbar-group files-info-sort">
      <select
        className="files-info-sort-select"
        value=${sort.by}
        aria-label="Sort by"
        onChange=${(event) => onSortChange({ ...sort, by: event.target.value })}
      >
        <option value="name">Name</option>
        <option value="size">Size</option>
        <option value="modified">Modified</option>
      </select>
      <button
        type="button"
        className="files-info-tool"
        title=${sort.desc ? "Sort descending" : "Sort ascending"}
        aria-label="Sort direction"
        aria-pressed=${sort.desc}
        onClick=${() => onSortChange({ ...sort, desc: !sort.desc })}
      >
        <${sort.desc ? ArrowDown : ArrowUp} size=${15} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

export function renderViewToolbar(
  { viewMode, sort, onViewModeChange, onSortChange },
) {
  const isGrid = viewMode === "grid";
  return html`
    <div className="files-info-toolbar">
      <div
        className="files-info-toolbar-group"
        role="group"
        aria-label="View mode"
      >
        ${viewButton({
          mode: "grid",
          active: isGrid,
          title: "Grid view",
          label: "Grid view",
          BodyIcon: LayoutGrid,
          onViewModeChange,
        })}
        ${viewButton({
          mode: "list",
          active: !isGrid,
          title: "List view",
          label: "List view",
          BodyIcon: List,
          onViewModeChange,
        })}
      </div>
      ${renderSortControls({ sort, onSortChange })}
    </div>
  `;
}

function renderChildrenMore(childrenTotal, children, className) {
  return childrenTotal > children.length &&
    html`<p className=${className}>… and ${childrenTotal - children.length} more</p>`;
}

export function renderGridItems({
  children,
  selectedChild,
  makeInteraction,
  childrenTotal,
  loading,
}) {
  return html`
    <div className="files-info-grid">
      ${children.map((child) => {
        const ChildIcon = getEntryIcon(
          child.name,
          child.isDirectory,
          child.iconKind,
        );
        return html`
          <button
            key=${child.name}
            type="button"
            className=${`${
              child.isDirectory
                ? "files-info-grid-item dir"
                : "files-info-grid-item"
            }${selectedChild === child ? " selected" : ""}`}
            title=${child.isDirectory ? `${child.name}/` : child.name}
            ...${makeInteraction(child)}
          >
            <${ChildIcon} size=${26} aria-hidden=${true}/>
            <span>${child.name}</span>
          </button>
        `;
      })}
      ${renderChildrenMore(childrenTotal, children, "files-info-children-more")}
      ${loading
        ? html`<p className="files-info-grid-note">Loading…</p>`
        : children.length === 0 &&
          html`<p className="files-info-grid-note">Empty folder.</p>`}
    </div>
  `;
}

function renderListHeader({
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
}) {
  return html`
    <div className="files-info-table-header">
      <div className="files-info-col files-info-col-icon" aria-hidden=${true}></div>
      ${sortHeaderButton({ by: "name", label: "Name", sort, onSortChange })}
      <div className="files-info-col-wrap files-info-col-mtime">
        ${sortHeaderButton({ by: "modified", label: "Modified", sort, onSortChange })}
        ${colResizer("mtime", columnWidths, onColumnWidthChange)}
      </div>
      <div className="files-info-col-wrap files-info-col-size">
        ${sortHeaderButton({ by: "size", label: "Size", sort, onSortChange })}
        ${colResizer("size", columnWidths, onColumnWidthChange)}
      </div>
    </div>
  `;
}

function renderListRow(child, selectedChild, makeInteraction) {
  const ChildIcon = getEntryIcon(
    child.name,
    child.isDirectory,
    child.iconKind,
  );
  return html`
    <button
      key=${child.name}
      type="button"
      className=${`${
        child.isDirectory ? "files-info-child dir" : "files-info-child"
      }${selectedChild === child ? " selected" : ""}`}
      title=${child.isDirectory ? `${child.name}/` : child.name}
      ...${makeInteraction(child)}
    >
      <${ChildIcon} size=${13} aria-hidden=${true}/>
      <span className="files-info-child-name">${child.name}</span>
      <span className="files-info-child-mtime">${child.isDirectory ? "" : formatModTimeColumn(child.modTime)}</span>
      <span className="files-info-child-size">${child.isDirectory ? "" : formatFileSize(child.size)}</span>
    </button>
  `;
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
  return html`
    <div className="files-info-children">
      ${renderListHeader({ sort, onSortChange, columnWidths, onColumnWidthChange })}
      ${children.map((child) =>
        renderListRow(child, selectedChild, makeInteraction),
      )}
      ${renderChildrenMore(childrenTotal, children, "files-info-children-more")}
      ${!loading && children.length === 0 &&
        html`<p className="files-info-children-empty">Empty folder.</p>`}
    </div>
  `;
}

function renderMediaPreview(preview, name) {
  if (preview.kind === "image") {
    return html`<img src=${preview.url} alt=${name}/>`;
  }
  if (preview.kind === "audio") {
    return html`<audio src=${preview.url} controls=${true} preload="metadata"></audio>`;
  }
  if (preview.kind === "video") {
    return html`<video src=${preview.url} controls=${true} preload="metadata"></video>`;
  }
  return html`<iframe src=${preview.url} title="PDF preview"></iframe>`;
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
    return html`
      <div className=${`files-info-preview ${info.preview.kind}`}>
        ${renderMediaPreview(info.preview, info.name)}
      </div>
    `;
  }
  if (info.textPreview != null) {
    return html`
      <pre className="files-info-text-preview">${info.textPreview}</pre>
    `;
  }
  if (!showChildren) {
    const Icon = getEntryIcon(info.name, info.isDirectory, info.iconKind);
    return html`
      <div className="files-info-icon">
        <${Icon} size=${36} aria-hidden=${true}/>
      </div>
    `;
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
  return html`
    <${React.Fragment}>
      <dt>${dt}</dt>
      <dd>${dd}</dd>
    </${React.Fragment}>
  `;
}

function renderMetadataList({ info, selectedChild, basePathText }) {
  const target = selectedChild || info;
  return html`
    <dl className="files-info-list">
      ${metadataRow(
        "Path",
        selectedChild
          ? `/${[basePathText, selectedChild.name].filter(Boolean).join("/")}`
          : `/${basePathText}`,
      )}
      ${!target.isDirectory &&
        metadataRow("Size", formatFileSize(target.size))}
      ${!selectedChild && info.isDirectory && info.entries != null &&
        metadataRow(
          "Items",
          `${info.entries} item${info.entries === 1 ? "" : "s"}`,
        )}
      ${metadataRow("Modified", formatModTime(target.modTime))}
    </dl>
  `;
}

export function renderInfoFooter(
  { info, selectedChild, basePathText, typeLabel },
) {
  return html`
    <footer className="files-info-footer">
      <div className="files-info-heading">
        <h2
          className="files-info-name"
          title=${selectedChild ? selectedChild.name : info.name}
        >${selectedChild ? selectedChild.name : info.name}</h2>
        <p className="files-info-type">${selectedChild ? childTypeLabel(selectedChild) : typeLabel}</p>
      </div>
      ${renderMetadataList({ info, selectedChild, basePathText })}
    </footer>
  `;
}
