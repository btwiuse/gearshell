// files-topbar.js — the Files panel's top location bar, styled after
// Windows Explorer: action buttons on the left, a clickable breadcrumb
// (or editable path input) pinned to the right. Kept in its own module
// so files-ui.js stays under the 500-line rule.
import React, { useState } from "react";
import htm from "htm";
import {
  ArrowUp,
  FilePlus2,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { FilesBreadcrumb } from "./files-ui.js?v=20260826.40";

const html = htm.bind(React.createElement);

function renderTopbarAction({
  title,
  label,
  disabled,
  onClick,
  icon,
  loading,
}) {
  return html`
    <button
      type="button"
      title=${title}
      aria-label=${label}
      ...${disabled != null && { disabled }}
      onClick=${onClick}
    >
      <${icon} className=${loading ? "files-spinning" : ""} size=${15} aria-hidden=${true}/>
    </button>
  `;
}

function renderTopbarActions({
  path,
  onParent,
  onRefresh,
  loading,
  onUpload,
  onNewFile,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
}) {
  const btn = (title, icon, onClick, extra = {}) =>
    renderTopbarAction({ title, label: title, icon, onClick, ...extra });
  return html`
    <div className="files-topbar-actions">
      ${btn("Parent folder", ArrowUp, onParent, { disabled: path === "." })}
      ${btn("Refresh files", RefreshCw, onRefresh, { loading })}
      ${btn("Upload files", Upload, onUpload)}
      ${btn("New file", FilePlus2, onNewFile)}
      ${btn("New folder", FolderPlus, onNewFolder)}
      ${path !== "." &&
        html`
          <${React.Fragment}>
            ${btn("Rename folder", Pencil, onRenameFolder)}
            ${btn("Delete empty folder", Trash2, onDeleteFolder)}
          </${React.Fragment}>
        `}
    </div>
  `;
}

function renderPathEditor(
  { pathDraft, onPathDraftChange, onNavigate, setEditing },
) {
  return html`
    <input
      className="files-topbar-input"
      value=${pathDraft}
      autoFocus=${true}
      spellCheck=${false}
      aria-label="Filesystem path"
      onChange=${(event) => onPathDraftChange(event.target.value)}
      onKeyDown=${(event) => {
        if (event.key === "Enter") {
          onNavigate();
          setEditing(false);
        }
        if (event.key === "Escape") setEditing(false);
      }}
      onBlur=${() => setEditing(false)}
    />
  `;
}

function renderBreadcrumbWrap(
  { displayPath, onBreadcrumbNavigate, openEditor, onStartEdit, setEditing },
) {
  return html`
    <div className="files-topbar-breadcrumb-wrap" onClick=${openEditor}>
      <${FilesBreadcrumb} path=${displayPath} onNavigate=${onBreadcrumbNavigate}/>
      <button
        type="button"
        className="files-topbar-edit"
        title="Edit path"
        aria-label="Edit path"
        onClick=${() => {
          onStartEdit();
          setEditing(true);
        }}
      >
        <${Pencil} size=${13} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

export function FilesTopbar({
  path,
  displayPath,
  pathDraft,
  loading,
  onPathDraftChange,
  onNavigate,
  onBreadcrumbNavigate,
  onParent,
  onRefresh,
  onUpload,
  onNewFile,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onStartEdit,
}) {
  const [editing, setEditing] = useState(false);
  const openEditor = (event) => {
    if (event.target.classList.contains("files-breadcrumb-current")) {
      onStartEdit();
      setEditing(true);
    }
  };
  return html`
    <div className="files-topbar">
      ${renderTopbarActions({
        path,
        onParent,
        onRefresh,
        loading,
        onUpload,
        onNewFile,
        onNewFolder,
        onRenameFolder,
        onDeleteFolder,
      })}
      <div className="files-topbar-location">
        ${editing
          ? renderPathEditor({
            pathDraft,
            onPathDraftChange,
            onNavigate,
            setEditing,
          })
          : renderBreadcrumbWrap({
            displayPath,
            onBreadcrumbNavigate,
            openEditor,
            onStartEdit,
            setEditing,
          })}
      </div>
    </div>
  `;
}
