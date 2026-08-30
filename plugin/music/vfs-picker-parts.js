// vfs-picker-parts.js — presentational rows for the VFS picker modal
// (500-line split out of vfs-picker.js). Pure props-in/JSX-out; all
// state and navigation lives in vfs-picker.js.

import React from "react";
import { ArrowUp, ChevronRight, File, Folder, Play } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function PickerRow({
  entry,
  mode,
  checked,
  selected,
  onOpen,
  onToggle,
  onPlaySingle,
}) {
  const Icon = entry.isDirectory ? Folder : File;
  const label = entry.isDirectory ? "Open directory" : "Pick file";
  return html`
    <div
      className=${`vfs-picker-row ${entry.isDirectory ? "vfs-picker-row-dir" : ""}` +
        (selected ? " vfs-picker-row-selected" : "")}
      role="button"
      tabIndex=${0}
      title=${label}
      onClick=${() => (entry.isDirectory ? onOpen() : onToggle(entry))}
      onKeyDown=${(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (entry.isDirectory) onOpen();
          else onToggle(entry);
        }
      }}
    >
      <${Icon} size=${15} className="vfs-picker-row-icon" aria-hidden=${true}/>
      <span className="vfs-picker-row-name">${entry.name}</span>
      ${!entry.isDirectory && mode === "multi" &&
        html`<${Play}
          size=${14}
          className="vfs-picker-row-play"
          aria-label="Play now"
          onClick=${(event) => {
            event.stopPropagation();
            onPlaySingle(entry);
          }}
        />`}
      ${!entry.isDirectory && mode === "multi" && checked &&
        html`<span className="vfs-picker-row-check">✓</span>`}
    </div>
  `;
}

export function PickerCrumbs({ path, navigate }) {
  const segments = path === "." ? [] : path.split("/");
  return html`
    <div className="vfs-picker-crumbs">
      <button
        type="button"
        className="vfs-picker-crumb"
        onClick=${() => navigate(".")}
      >/</button>
      ${segments.map((segment, index) =>
        html`
          <span key=${index} className="vfs-picker-crumb-wrap">
            <${ChevronRight} size=${12} className="vfs-picker-crumb-sep" aria-hidden=${true}/>
            <button
              type="button"
              className="vfs-picker-crumb"
              onClick=${() => navigate(segments.slice(0, index + 1).join("/"))}
            >${segment}</button>
          </span>
        `,
      )}
    </div>
  `;
}

export function PickerToolbar({ path, draft, setDraft, submitPath, goUp, navigate }) {
  return html`
    <div className="vfs-picker-toolbar">
      <button
        type="button"
        className="vfs-picker-up"
        title="Up one directory"
        aria-label="Up one directory"
        disabled=${path === "."}
        onClick=${goUp}
      >
        <${ArrowUp} size=${14} aria-hidden=${true}/>
      </button>
      <${PickerCrumbs} path=${path} navigate=${navigate}/>
      <input
        className="vfs-picker-path"
        type="text"
        spellCheck=${false}
        value=${draft}
        aria-label="Path"
        onChange=${(event) => setDraft(event.target.value)}
        onKeyDown=${(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitPath();
          }
        }}
      />
    </div>
  `;
}

export function PickerBody({
  loading,
  error,
  entries,
  mode,
  marked,
  selectedIndex,
  navigate,
  pickSingle,
  toggleMark,
  onPlaySingle,
}) {
  if (loading) {
    return html`<p className="vfs-picker-status">Loading…</p>`;
  }
  if (error) {
    return html`<p className="vfs-picker-error">${error}</p>`;
  }
  if (entries.length === 0) {
    return html`<p className="vfs-picker-status">Empty directory</p>`;
  }
  return entries.map((entry, index) =>
    html`<${PickerRow}
      key=${entry.path}
      entry=${entry}
      mode=${mode}
      checked=${marked.has(entry.path)}
      selected=${index === selectedIndex}
      onOpen=${() => navigate(entry.path)}
      onToggle=${(target) =>
        mode === "single" ? pickSingle(target) : toggleMark(target)}
      onPlaySingle=${onPlaySingle}
    />`,
  );
}

export function PickerFooter({ marked, actions }) {
  return html`
    <div className="vfs-picker-footer">
      <span className="vfs-picker-count">${marked.length === 0 ? "No files selected" : `${marked.length} selected`}</span>
      <div className="vfs-picker-actions">
        ${actions.map((action, index) =>
          html`
            <button
              type="button"
              key=${index}
              className=${`vfs-picker-btn ${
                action.primary ? "vfs-picker-btn-primary" : ""
              }`}
              disabled=${marked.length === 0}
              onClick=${() => action.onPick(marked)}
            >${typeof action.label === "function"
              ? action.label(marked.length)
              : action.label}</button>
          `,
        )}
      </div>
    </div>
  `;
}
