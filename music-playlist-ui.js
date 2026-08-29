// music-playlist-ui.js — playlist UI for the Music panel: the
// drag-reorderable queue list and the named-playlist toolbar.
//
// Split out of music-panel-parts.js (500-line rule). Pure views over
// engine state; all engine calls happen in music.js.

import React, { useState } from "react";
import { ListMusic, Pencil, Save, Trash2, X } from "lucide-react";

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
  return React.createElement(
    "div",
    {
      className: `music-queue-row ${active ? "music-queue-row-active" : ""}${
        dragOver ? " music-queue-row-drag-over" : ""
      }`,
      role: "button",
      tabIndex: 0,
      draggable: true,
      title: `${track.src} — drag to reorder`,
      onClick: () => onPickAt(index),
      onKeyDown: (event) => {
        if (event.key === "Enter") onPickAt(index);
      },
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd,
    },
    React.createElement(
      "span",
      { className: "music-queue-index" },
      active ? "♪" : index + 1,
    ),
    React.createElement(
      "span",
      { className: "music-queue-title" },
      track.title,
    ),
    React.createElement("span", { className: "music-queue-src" }, track.src),
    React.createElement(
      "button",
      {
        type: "button",
        className: "music-queue-remove",
        title: "Remove from playlist",
        "aria-label": `Remove ${track.title}`,
        onClick: (event) => {
          event.stopPropagation();
          onRemoveAt(index);
        },
      },
      React.createElement(X, { size: 12, "aria-hidden": true }),
    ),
  );
}

// The playlist list: HTML5 drag-and-drop reorder plus the existing
// click-to-play / per-row remove / Clear actions.
function renderQueueHeader(queue, onClear) {
  return React.createElement(
    "div",
    { className: "music-section-head" },
    React.createElement(ListMusic, { size: 14, "aria-hidden": true }),
    React.createElement("h3", null, "Playlist"),
    queue.length > 0 &&
      React.createElement(
        "button",
        {
          type: "button",
          className: "music-clear-btn",
          title: "Clear playlist",
          onClick: onClear,
        },
        "Clear",
      ),
  );
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
  return React.createElement(
    "div",
    { className: "music-queue" },
    renderQueueHeader(queue, onClear),
    queue.length === 0
      ? React.createElement(
        "p",
        { className: "music-empty" },
        "No tracks queued. Browse the filesystem to build a playlist.",
      )
      : queue.map((track, index) =>
        React.createElement(QueueRow, {
          key: `${index}-${track.src}`,
          track,
          index,
          active: index === queueIndex,
          dragOver: dragIndex != null && dragIndex !== index &&
            overIndex === index,
          onPickAt,
          onRemoveAt,
          onDragStart: () => setDragIndex(index),
          onDragOver: (event) => {
            event.preventDefault();
            if (index !== dragIndex) setOverIndex(index);
          },
          onDrop: (event) => {
            event.preventDefault();
            if (dragIndex != null && dragIndex !== index) {
              onReorder(dragIndex, index);
            }
            setDragIndex(null);
            setOverIndex(null);
          },
          onDragEnd: () => {
            setDragIndex(null);
            setOverIndex(null);
          },
        })
      ),
  );
}

// Saved-playlist switcher: load by dropdown, save the current queue,
// rename / delete the selected playlist.
function PlaylistPicker({ playlists, selectedId, onSelect }) {
  return React.createElement(
    "select",
    {
      className: "music-playlist-select",
      value: selectedId,
      "aria-label": "Playlists",
      onChange: (event) => onSelect(event.target.value),
    },
    React.createElement("option", { value: "" }, "Current queue"),
    playlists.map((playlist) =>
      React.createElement(
        "option",
        { key: playlist.id, value: playlist.id },
        `${playlist.name} (${playlist.count})`,
      )
    ),
  );
}

function PlaylistActions({ selectedId, onSave, onRename, onDelete }) {
  return React.createElement(
    "div",
    { className: "music-playlist-actions" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "music-playlist-btn",
        title: "Save the current queue as a playlist",
        onClick: onSave,
      },
      React.createElement(Save, { size: 13, "aria-hidden": true }),
      " Save",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "music-playlist-btn",
        title: "Rename playlist",
        "aria-label": "Rename playlist",
        disabled: !selectedId,
        onClick: onRename,
      },
      React.createElement(Pencil, { size: 13, "aria-hidden": true }),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "music-playlist-btn music-playlist-btn-danger",
        title: "Delete playlist",
        "aria-label": "Delete playlist",
        disabled: !selectedId,
        onClick: onDelete,
      },
      React.createElement(Trash2, { size: 13, "aria-hidden": true }),
    ),
  );
}

export function PlaylistToolbar({
  playlists,
  selectedId,
  onSelect,
  onSave,
  onRename,
  onDelete,
}) {
  return React.createElement(
    "div",
    { className: "music-playlist-toolbar" },
    React.createElement(PlaylistPicker, { playlists, selectedId, onSelect }),
    React.createElement(PlaylistActions, {
      selectedId,
      onSave,
      onRename,
      onDelete,
    }),
  );
}
