// notes.js — Apple Notes–style iframe plugin module.
//
// Persistence: notes + folders live under the per-workspace config.kv
// store for metadata (folder list, note index, pin list, id counter)
// and under /opfs/home/notes/<folder-slug>/<note-slug>.md for bodies
// (see notes-storage.js). The kv store fires "config.changed" on every
// write; FileSystemObserver on /opfs/home/notes fires "fs.changed" on
// every body mutation. Both events flow to useNotesStore which keeps
// local state in sync.
//
// KV layout:
//
//   notes:_nextId   — monotonic counter for new ids
//   notes:_folders  — [{id, slug, name, createdAt}]
//   notes:_notes    — [{id, folderId, slug, title, pinned, createdAt,
//                      updatedAt, bodyRef}]
//   notes:_pinned   — [noteId]
//
// On first boot notes-storage.js detects legacy entries (records with
// `body` or folders without `slug`) and migrates them in place,
// materialising bodies to fs before rewriting the index.

import htm from "htm";
import React from "react";

const html = htm.bind(React.createElement);

// --- Shell bridge: the gear-bridge guard skips installation when
// window.top === window.self, so an iframe plugin host is the only
// place the bridge is live. When the page is opened directly (in a
// browser tab for development), GearShell stays undefined and the
// UI renders an explanatory empty state.
const bridgeAvailable = typeof GearShell !== "undefined";

// --- Date helpers — formatted like Apple Notes: "Today 2:34 PM",
// "Yesterday 9:01 AM", "Monday 5:12 PM" within the past week, then
// the absolute date. Cheap to render and matches the sidebar's dense
// list rhythm.
function formatTimestamp(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return `${d.toLocaleDateString([], { weekday: "long" })} ${d.toLocaleTimeString(
      [],
      { hour: "numeric", minute: "2-digit" },
    )}`;
  }
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

// Take the markdown body as stored on disk and produce the single
// preview line shown in the note list. Strips headings, takes the
// first non-empty line. We deliberately keep this a pure function of
// the body string — title is rendered separately in the row head.
function previewBody(body) {
  if (!body) return "No additional text";
  return body
    .replace(/^#+\s.*$/gm, "")
    .split("\n")
    .find((line) => line.trim()) || "No additional text";
}

export {
  bridgeAvailable,
  html,
  React,
  formatTimestamp,
  previewBody,
};