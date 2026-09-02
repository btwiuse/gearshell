// notes-components.js — Sidebar / NoteList / Editor / Notice for the
// Notes iframe plugin. Kept in a separate file from notes.js so
// store.js + components.js + index.html bootstrap all stay under the
// 500-line rule.

import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Folder,
  FileText,
  Pin,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

import {
  html,
  bridgeAvailable,
  formatTimestamp,
  previewBody,
} from "./notes.js";

// --- Sidebar: smart folders ("All Notes", "Pinned") at the top, then
// user folders with rename/delete affordances on hover (Apple Notes'
// "Folders" section).
export function Sidebar({ store }) {
  const {
    folders, activeFolderId, setActiveFolderId, folderCounts,
    renamingFolder, setRenamingFolder, renameFolder,
    createFolder, deleteFolder,
  } = store;
  return html`
    <aside class="sidebar">
      <div class="sidebar-brand">
        <${FileText} size=${22} className="sidebar-brand-icon" />
        <span class="sidebar-brand-title">Notes</span>
      </div>
      <nav class="sidebar-nav">
        <${SidebarItem}
          icon=${FileText}
          label="All Notes"
          active=${activeFolderId === "all"}
          count=${folderCounts.all}
          onClick=${() => setActiveFolderId("all")}
        />
        <${SidebarItem}
          icon=${Pin}
          label="Pinned"
          active=${activeFolderId === "pinned"}
          count=${folderCounts.pinned}
          onClick=${() => setActiveFolderId("pinned")}
        />
        <div class="sidebar-divider" />
        <div class="sidebar-section-header">
          <span>Folders</span>
          <button
            class="icon-btn"
            title="New folder"
            aria-label="New folder"
            onClick=${() => createFolder("New Folder")}
          >
            <${Plus} size=${14} />
          </button>
        </div>
        ${folders.map((folder) => html`
          <${FolderRow}
            key=${folder.id}
            folder=${folder}
            active=${activeFolderId === folder.id}
            count=${folderCounts[folder.id] || 0}
            renaming=${renamingFolder === folder.id}
            onClick=${() => setActiveFolderId(folder.id)}
            onStartRename=${() => setRenamingFolder(folder.id)}
            onFinishRename=${(name) => { renameFolder(folder.id, name); setRenamingFolder(null); }}
            onCancelRename=${() => setRenamingFolder(null)}
            onDelete=${() => deleteFolder(folder.id)}
          />
        `)}
      </nav>
    </aside>
  `;
}

export function SidebarItem({ icon: Icon, label, active, count, onClick }) {
  return html`
    <button
      type="button"
      class=${`sidebar-item ${active ? "is-active" : ""}`}
      onClick=${onClick}
    >
      <${Icon} size=${16} className="sidebar-item-icon" />
      <span class="sidebar-item-label">${label}</span>
      <span class="sidebar-item-count">${count}</span>
    </button>
  `;
}

export function FolderRow({
  folder, active, count, renaming,
  onClick, onStartRename, onFinishRename, onCancelRename, onDelete,
}) {
  const [draft, setDraft] = useState(folder.name);
  useEffect(() => { setDraft(folder.name); }, [folder.name]);
  return html`
    <div class=${`folder-row ${active ? "is-active" : ""}`}>
      <button type="button" class="folder-row-main" onClick=${onClick}>
        <${Folder} size=${15} className="sidebar-item-icon" />
        ${renaming ? html`
          <input
            type="text"
            class="folder-rename"
            autoFocus
            value=${draft}
            onInput=${(e) => setDraft(e.target.value)}
            onBlur=${() => onFinishRename(draft.trim() || folder.name)}
            onKeyDown=${(e) => {
              if (e.key === "Enter") onFinishRename(draft.trim() || folder.name);
              if (e.key === "Escape") onCancelRename();
            }}
          />
        ` : html`<span class="sidebar-item-label">${folder.name}</span>`}
        <span class="sidebar-item-count">${count}</span>
      </button>
      <div class="folder-row-actions">
        <button
          type="button"
          class="icon-btn"
          title="Rename folder"
          aria-label="Rename folder"
          onClick=${(e) => { e.stopPropagation(); onStartRename(); }}
        >
          <${Pencil} size=${12} />
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Delete folder"
          aria-label="Delete folder"
          onClick=${(e) => { e.stopPropagation(); onDelete(); }}
        >
          <${Trash2} size=${12} />
        </button>
      </div>
    </div>
  `;
}

// --- Note list (middle column) — sorted by pinned-first then by
// updatedAt desc, each row showing a one-line preview, folder dot,
// and timestamp.
//
// On wide screens the header shows just the heading + search +
// compose. On narrow screens the heading moves into a top nav row
// with a back chevron (returns to the sidebar) and a Folders button
// (re-opens the sidebar) — Apple's iPhone Notes pattern.
export function NoteList({ store }) {
  const {
    visibleNotes, activeNoteId, setActiveNoteId,
    query, setQuery, folders, createNote, activeFolderId,
    goBack, goToView,
  } = store;
  const activeFolder = folders.find(
    (f) => f.id === (activeFolderId === "all" || activeFolderId === "pinned" ? null : activeFolderId),
  );
  const heading = activeFolder?.name
    || (activeFolderId === "pinned" ? "Pinned" : "All Notes");
  return html`
    <section class="note-list">
      <header class="note-list-header">
        <div class="note-list-nav">
          <button
            type="button"
            class="icon-btn nav-back"
            aria-label="Back to folders"
            title="Back to folders"
            onClick=${() => goToView("sidebar")}
          >
            <${ChevronLeft} size=${18} />
          </button>
          <h2 class="note-list-title">${heading}</h2>
        </div>
        <div class="note-list-toolbar">
          <div class="search">
            <${Search} size=${14} className="search-icon" />
            <input
              type="search"
              class="search-input"
              placeholder="Search"
              value=${query}
              onInput=${(e) => setQuery(e.target.value)}
            />
            ${query && html`
              <button
                type="button"
                class="search-clear"
                aria-label="Clear search"
                onClick=${() => setQuery("")}
              >
                <${X} size=${12} />
              </button>
            `}
          </div>
          <button
            type="button"
            class="compose-btn"
            onClick=${() => createNote(activeFolder?.id)}
            aria-label="New note"
            title="New note"
          >
            <${Plus} size=${16} />
          </button>
        </div>
      </header>
      <div class="note-list-scroll">
        ${visibleNotes.length === 0 && html`
          <div class="empty">
            <${FileText} size=${36} className="empty-icon" />
            <p class="empty-title">No notes yet</p>
            <p class="empty-hint">Click + to start writing.</p>
          </div>
        `}
        ${visibleNotes.map((note) => html`
          <button
            key=${note.id}
            type="button"
            class=${`note-row ${activeNoteId === note.id ? "is-active" : ""}`}
            onClick=${() => setActiveNoteId(note.id)}
          >
            <div class="note-row-head">
              <span class="note-row-title">
                ${note.pinned && html`<${Pin} size=${11} className="pin-mini" />`}
                ${note.title || "New Note"}
              </span>
              <span class="note-row-time">${formatTimestamp(note.updatedAt)}</span>
            </div>
            <div class="note-row-preview">${previewBody(note.body)}</div>
            <div class="note-row-meta">
              <span class="note-row-folder">
                ${folders.find((f) => f.id === note.folderId)?.name || "—"}
              </span>
            </div>
          </button>
        `)}
      </div>
    </section>
  `;
}

// --- Editor: title + plain-text body. Auto-saves 400ms after the last
// keystroke so typing doesn't kick off a kv.set on every character
// (the kv store is a transactional audit-logged write — one write per
// debounce window keeps the audit ring readable).
export function Editor({ store }) {
  const { activeNote, updateNote, deleteNote, togglePin, goBack } = store;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const saveTimer = useRef(null);

  useEffect(() => {
    setTitle(activeNote?.title || "");
    setBody(activeNote?.body || "");
  }, [activeNote?.id]);

  const schedule = (patch) => {
    if (!activeNote) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateNote(activeNote.id, patch), 400);
  };

  const onTitle = (e) => {
    const next = e.target.value;
    setTitle(next);
    schedule({ title: next });
  };
  const onBody = (e) => {
    const next = e.target.value;
    setBody(next);
    schedule({ body: next });
  };

  if (!activeNote) {
    return html`
      <section class="editor empty-editor">
        <div class="empty">
          <${FileText} size=${48} className="empty-icon" />
          <p class="empty-title">Select a note</p>
          <p class="empty-hint">Or click + to write something new.</p>
        </div>
      </section>
    `;
  }

  return html`
    <section class="editor">
      <header class="editor-toolbar">
        <div class="editor-toolbar-left">
          <button
            type="button"
            class="icon-btn nav-back"
            aria-label="Back to notes"
            title="Back to notes"
            onClick=${goBack}
          >
            <${ChevronLeft} size=${18} />
          </button>
          <span class="editor-time">${formatTimestamp(activeNote.updatedAt)}</span>
        </div>
        <div class="editor-actions">
          <button
            type="button"
            class=${`icon-btn ${activeNote.pinned ? "is-pinned" : ""}`}
            title=${activeNote.pinned ? "Unpin" : "Pin"}
            aria-label=${activeNote.pinned ? "Unpin" : "Pin"}
            onClick=${() => togglePin(activeNote.id)}
          >
            <${Pin} size=${15} />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="Delete note"
            aria-label="Delete note"
            onClick=${() => {
              if (window.confirm("Delete this note? This cannot be undone.")) {
                deleteNote(activeNote.id);
              }
            }}
          >
            <${Trash2} size=${15} />
          </button>
        </div>
      </header>
      <input
        type="text"
        class="editor-title"
        placeholder="Title"
        value=${title}
        onInput=${onTitle}
      />
      <textarea
        class="editor-body"
        placeholder="Start writing…"
        value=${body}
        onInput=${onBody}
        spellCheck="true"
      />
      <footer class="editor-footer">
        <span class="editor-meta">
          ${activeNote.body?.length || 0} chars ·
          last edited ${formatTimestamp(activeNote.updatedAt)}
        </span>
      </footer>
    </section>
  `;
}

// --- Notice (top-right toast) for save errors and confirmations.
export function Notice({ notice }) {
  if (!notice) return null;
  return html`
    <div class=${`notice notice-${notice.kind}`} role="status" aria-live="polite">
      ${notice.kind === "ok" ? html`<${Check} size=${14} />` : html`<${X} size=${14} />`}
      <span>${notice.text}</span>
    </div>
  `;
}

export function EmptyBridgeState() {
  return html`
    <div class="empty-bridge">
      <${FileText} size=${56} className="empty-bridge-icon" />
      <h2>Notes runs inside a panel</h2>
      <p>This page only saves data when it has access to the shell's <code>GearShell.config.kv</code> store.</p>
      <p>Open it from the shell's Plugins page or panel launcher.</p>
    </div>
  `;
}