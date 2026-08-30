// files-parts.js — presentational pieces of the Files panel: path helpers,
// the sidebar toolbar, the entry list, and the editor pane. Split out of
// files.js (500-line rule); files.js owns the panel state and handlers,
// this module renders them without touching the filesystem itself.
import React from "react";
import htm from "htm";
import { Check, ChevronRight, X } from "lucide-react";
import { FilesEditorPane } from "./files-editor-pane.js?v=20260828.8";
import { FavoritesSidebar } from "./files-favorites-ui.js?v=20260826.46";
import { VolumesSidebar } from "../files-mounts.js?v=20260826.45";

const html = htm.bind(React.createElement);

// === Right pane (editor / directory grid preview) ===
// Composes the editor pane with a fallback "current directory" info
// object: with nothing selected, the right side previews the folder you
// are in as an Explorer-style icon grid. Kept in files-parts.js so
// files.js stays under the 500-line rule.

export function FilesRightPane({
  selectedPath,
  preview,
  contents,
  binary,
  dirty,
  info,
  entries,
  loading,
  status,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
  onDownload,
  onSave,
  onRename,
  onDelete,
  onChange,
  finePointer,
  onSelectChild,
  onOpenChild,
  currentPath,
}) {
  return html`
    <${FilesEditorPane}
      selectedPath=${selectedPath}
      preview=${preview}
      contents=${contents}
      binary=${binary}
      dirty=${dirty}
      info=${info || {
        path: currentPath === "." ? "/" : `/${currentPath.replace(/^\/+/, "")}`,
        name: currentPath === "." ? "/" : currentPath.split("/").pop(),
        isDirectory: true,
        size: null,
        modTime: null,
        previewKind: null,
        iconKind: null,
        preview: null,
        textPreview: null,
        loading,
        entries: entries.length,
        children: entries,
        childrenTotal: entries.length,
      }}
      viewMode=${viewMode}
      onViewModeChange=${onViewModeChange}
      sort=${sort}
      onSortChange=${onSortChange}
      columnWidths=${columnWidths}
      onColumnWidthChange=${onColumnWidthChange}
      status=${status}
      onDownload=${onDownload}
      onSave=${onSave}
      onRename=${onRename}
      onDelete=${onDelete}
      onChange=${onChange}
      finePointer=${finePointer}
      onSelectChild=${onSelectChild}
      onOpenChild=${onOpenChild}
    />
  `;
}

// === Sidebar (favorites + volumes + creation form) ===

function ExplorerSection({ collapsed, onToggle, children }) {
  return html`
    <div className=${collapsed
      ? "files-section"
      : "files-section files-section-expanded"}>
      <button
        type="button"
        className="files-sidebar-toggle files-section-header"
        onClick=${onToggle}
        aria-expanded=${!collapsed}
        title=${collapsed ? "Expand Explorer" : "Collapse Explorer"}
      >
        <${ChevronRight} size=${13} className=${collapsed ? "" : "open"} aria-hidden=${true}/>
        <span className="files-volumes-title">Explorer</span>
      </button>
      ${!collapsed && children}
    </div>
  `;
}

export function FilesSidebar({
  favorites,
  currentPath,
  onOpen,
  onRemove,
  mounts,
  onMount,
  onOpenMount,
  onUnmount,
  fileInputRef,
  creating,
  entryName,
  onEntryNameChange,
  onCreate,
  onCancel,
  onUpload,
  collapsedSections = {},
  onToggleSection,
  children,
}) {
  return html`
    <section className="files-sidebar">
      ${ExplorerSection({
        collapsed: collapsedSections.explorer,
        onToggle: () => onToggleSection("explorer"),
        children,
      })}
      <${FavoritesSidebar}
        favorites=${favorites}
        currentPath=${currentPath}
        onOpen=${onOpen}
        onRemove=${onRemove}
        collapsed=${collapsedSections.favorites}
        onToggle=${() => onToggleSection("favorites")}
      />
      <${VolumesSidebar}
        mounts=${mounts}
        onMount=${onMount}
        onOpen=${onOpenMount}
        onUnmount=${onUnmount}
        collapsed=${collapsedSections.volumes}
        onToggle=${() => onToggleSection("volumes")}
      />
      <input
        ref=${fileInputRef}
        className="files-upload-input"
        type="file"
        multiple=${true}
        onChange=${onUpload}
      />
      ${creating &&
        html`<${FilesCreateForm}
          creating=${creating}
          entryName=${entryName}
          onEntryNameChange=${onEntryNameChange}
          onCreate=${onCreate}
          onCancel=${onCancel}
        />`}
    </section>
  `;
}

// === Create entry form ===

export function FilesCreateForm(
  { creating, entryName, onEntryNameChange, onCreate, onCancel },
) {
  return html`
    <div className="files-create">
      <input
        autoFocus=${true}
        value=${entryName}
        placeholder=${creating.includes("folder") ? "folder name" : "file name"}
        onChange=${(event) => onEntryNameChange(event.target.value)}
        onKeyDown=${(event) => {
          if (event.key === "Enter") onCreate();
          if (event.key === "Escape") onCancel();
        }}
      />
      <button
        type="button"
        title=${`Create ${creating}`}
        aria-label=${`Create ${creating}`}
        onClick=${onCreate}
      >
        <${Check} size=${15} aria-hidden=${true}/>
      </button>
      <button
        type="button"
        title="Cancel"
        aria-label="Cancel"
        onClick=${onCancel}
      >
        <${X} size=${15} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

// === Sidebar resizer ===

export function FilesResizer({
  stackedLayout,
  sidebarWidth,
  sidebarHeight,
  onResizeStart,
  onResizeMove,
  onResizeStop,
  onResizeBy,
}) {
  return html`
    <div
      className="files-resizer"
      role="separator"
      tabIndex=${0}
      aria-label=${stackedLayout
        ? "Resize file browser file list height"
        : "Resize file browser sidebar"}
      aria-orientation=${stackedLayout ? "horizontal" : "vertical"}
      aria-valuemin=${stackedLayout ? 130 : 190}
      aria-valuenow=${Math.round(stackedLayout ? sidebarHeight : sidebarWidth)}
      onPointerDown=${onResizeStart}
      onPointerMove=${onResizeMove}
      onPointerUp=${onResizeStop}
      onPointerCancel=${onResizeStop}
      onKeyDown=${(event) => {
        const isRow = stackedLayout;
        const step = event.key === "Home"
          ? -1e4
          : event.key === "End"
          ? 1e4
          : event.shiftKey
          ? 64
          : 16;
        const matches = isRow
          ? event.key === "ArrowUp" || event.key === "ArrowDown"
          : event.key === "ArrowLeft" || event.key === "ArrowRight";
        if (event.key === "Home" || event.key === "End" || matches) {
          event.preventDefault();
          onResizeBy(
            event.key === "Home"
              ? -step
              : event.key === "End"
              ? step
              : event.key === "ArrowUp" || event.key === "ArrowLeft"
              ? -step
              : step,
          );
        }
      }}
    ></div>
  `;
}
