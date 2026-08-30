// music-playlist-ui.js — playlist UI for the Music panel: the
// drag-reorderable queue list and the named-playlist toolbar.
//
// Split out of music-panel-parts.js (500-line rule). Pure views over
// engine state; all engine calls happen in music.js.

import React, { useState } from "react";
import { ListMusic, Pencil, Save, Trash2, X } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

function QueueRow(
  {
    track,
    index,
    active,
    dragOver,
    onPickAt,
    onRemoveAt,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  },
) {
  return html`
    <div
      className=${`music-queue-row ${active ? "music-queue-row-active" : ""}${
        dragOver ? " music-queue-row-drag-over" : ""
      }`}
      role="button"
      tabIndex=${0}
      draggable=${true}
      title=${`${track.src} — drag to reorder`}
      onClick=${() => onPickAt(index)}
      onKeyDown=${(event) => {
        if (event.key === "Enter") onPickAt(index);
      }}
      onDragStart=${onDragStart}
      onDragOver=${onDragOver}
      onDrop=${onDrop}
      onDragEnd=${onDragEnd}
    >
      <span className="music-queue-index">${active ? "♪" : index + 1}</span>
      <span className="music-queue-title">${track.title}</span>
      <span className="music-queue-src">${track.src}</span>
      <button
        type="button"
        className="music-queue-remove"
        title="Remove from playlist"
        aria-label=${`Remove ${track.title}`}
        onClick=${(event) => {
          event.stopPropagation();
          onRemoveAt(index);
        }}
      >
        <${X} size=${12} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

// The playlist list: HTML5 drag-and-drop reorder plus the existing
// click-to-play / per-row remove / Clear actions.
function renderQueueHeader(queue, onClear) {
  return html`
    <div className="music-section-head">
      <${ListMusic} size=${14} aria-hidden=${true}/>
      <h3>Playlist</h3>
      ${queue.length > 0 &&
        html`<button
          type="button"
          className="music-clear-btn"
          title="Clear playlist"
          onClick=${onClear}
        >Clear</button>`}
    </div>
  `;
}

export function MusicQueueList({
  queue,
  queueIndex,
  onPickAt,
  onRemoveAt,
  onClear,
  onReorder,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  return html`
    <div className="music-queue">
      ${renderQueueHeader(queue, onClear)}
      ${queue.length === 0
        ? html`<p className="music-empty">No tracks queued. Browse the filesystem to build a playlist.</p>`
        : queue.map((track, index) =>
          html`<${QueueRow}
            key=${`${index}-${track.src}`}
            track=${track}
            index=${index}
            active=${index === queueIndex}
            dragOver=${dragIndex != null && dragIndex !== index &&
              overIndex === index}
            onPickAt=${onPickAt}
            onRemoveAt=${onRemoveAt}
            onDragStart=${() => setDragIndex(index)}
            onDragOver=${(event) => {
              event.preventDefault();
              if (index !== dragIndex) setOverIndex(index);
            }}
            onDrop=${(event) => {
              event.preventDefault();
              if (dragIndex != null && dragIndex !== index) {
                onReorder(dragIndex, index);
              }
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd=${() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          />`,
        )}
    </div>
  `;
}

// Saved-playlist switcher: load by dropdown, save the current queue,
// rename / delete the selected playlist.
function PlaylistPicker({ playlists, selectedId, onSelect }) {
  return html`
    <select
      className="music-playlist-select"
      value=${selectedId}
      aria-label="Playlists"
      onChange=${(event) => onSelect(event.target.value)}
    >
      <option value="">Current queue</option>
      ${playlists.map((playlist) =>
        html`<option key=${playlist.id} value=${playlist.id}>${playlist.name} (${playlist.count})</option>`,
      )}
    </select>
  `;
}

function PlaylistActions({ selectedId, onSave, onRename, onDelete }) {
  return html`
    <div className="music-playlist-actions">
      <button
        type="button"
        className="music-playlist-btn"
        title="Save the current queue as a playlist"
        onClick=${onSave}
      >
        <${Save} size=${13} aria-hidden=${true}/>
        Save
      </button>
      <button
        type="button"
        className="music-playlist-btn"
        title="Rename playlist"
        aria-label="Rename playlist"
        disabled=${!selectedId}
        onClick=${onRename}
      >
        <${Pencil} size=${13} aria-hidden=${true}/>
      </button>
      <button
        type="button"
        className="music-playlist-btn music-playlist-btn-danger"
        title="Delete playlist"
        aria-label="Delete playlist"
        disabled=${!selectedId}
        onClick=${onDelete}
      >
        <${Trash2} size=${13} aria-hidden=${true}/>
      </button>
    </div>
  `;
}

export function PlaylistToolbar({
  playlists,
  selectedId,
  onSelect,
  onSave,
  onRename,
  onDelete,
}) {
  return html`
    <div className="music-playlist-toolbar">
      <${PlaylistPicker} playlists=${playlists} selectedId=${selectedId} onSelect=${onSelect}/>
      <${PlaylistActions} selectedId=${selectedId} onSave=${onSave} onRename=${onRename} onDelete=${onDelete}/>
    </div>
  `;
}
