// notes.js — Apple Notes–style iframe plugin module.
//
// Persistence: notes + folders live under the per-workspace config.kv
// store (see plugin/crush-playground/kv-api.js) so they survive
// reloads and live-sync across every open Notes panel — the kv
// store fires "config.changed" on every write, which is the only
// signal multiple Notes panels need to redraw against the same
// canonical state.
//
// KV layout — three keys, all under the "notes:" prefix. Keeping
// notes and folders as separate keys means a single edit doesn't
// re-serialise the entire dataset, and the audit ring records one
// entry per write. The nextId allocator is a third key so the seed
// function can reuse the existing IDs on re-runs.
//
//   notes:_nextId   — monotonic counter for new ids
//   notes:_folders  — [{id, name, createdAt}]
//   notes:_notes    — [{id, folderId, title, body, pinned, createdAt, updatedAt}]
//   notes:_pinned   — [noteId] (kept as a separate index for fast filters)

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
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
} from "lucide-react";

const html = htm.bind(React.createElement);

const KV = {
  nextId: "notes:_nextId",
  folders: "notes:_folders",
  notes: "notes:_notes",
  pinned: "notes:_pinned",
};

// --- Shell bridge: the gear-bridge guard skips installation when
// window.top === window.self, so an iframe plugin host is the only
// place the bridge is live. When the page is opened directly (in a
// browser tab for development), GearShell stays undefined and the
// UI renders an explanatory empty state.
const bridgeAvailable = typeof GearShell !== "undefined";

async function kvGet(key) {
  if (!bridgeAvailable) return undefined;
  try {
    return await GearShell.config.kv.get(key);
  } catch {
    return undefined;
  }
}

async function kvSet(key, value) {
  if (!bridgeAvailable) return { ok: false };
  try {
    return await GearShell.config.kv.set(key, value);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function kvDelete(key) {
  if (!bridgeAvailable) return { deleted: false };
  try {
    return await GearShell.config.kv.delete(key);
  } catch {
    return { deleted: false };
  }
}

// Seed on first run: a default folder + welcome note so the UI
// doesn't open empty. Both writes go through kv.set so the audit
// ring records the bootstrap.
async function ensureSeed() {
  const folders = await kvGet(KV.folders);
  const notes = await kvGet(KV.notes);
  if (Array.isArray(folders) && folders.length) return { folders, notes: [] };
  const now = Date.now();
  const seedFolders = [{ id: "fld_notes", name: "Notes", createdAt: now }];
  const seedNotes = [
    {
      id: "nte_welcome",
      folderId: "fld_notes",
      title: "Welcome to Notes",
      body:
        "This is a Notes plugin — your notes are saved to the workspace's config.kv store, " +
        "so they survive reloads and sync live across every open Notes panel.\n\n" +
        "• Click + above to create a new note\n" +
        "• Drag notes between folders in the sidebar (right-click a folder to rename)\n" +
        "• Pin important notes with the pin button\n" +
        "• Search across all folders from the search box",
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await kvSet(KV.nextId, 2);
  await kvSet(KV.folders, seedFolders);
  await kvSet(KV.notes, seedNotes);
  return { folders: seedFolders, notes: seedNotes };
}

async function loadAll() {
  const [folders, notes, nextId, pinned] = await Promise.all([
    kvGet(KV.folders),
    kvGet(KV.notes),
    kvGet(KV.nextId),
    kvGet(KV.pinned),
  ]);
  return {
    folders: Array.isArray(folders) ? folders : [],
    notes: Array.isArray(notes) ? notes : [],
    nextId: typeof nextId === "number" ? nextId : 1,
    pinned: Array.isArray(pinned) ? pinned : [],
  };
}

function genId(prefix, n) {
  return `${prefix}_${n.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

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
  KV,
  kvGet,
  kvSet,
  kvDelete,
  ensureSeed,
  loadAll,
  genId,
  formatTimestamp,
  previewBody,
};