// music-playlists.js — named playlist storage for the music engine.
//
// Playlists are plain [{ src, title }] track lists persisted to
// localStorage, so reloads keep them without touching workspace config.
// Kept out of music-engine.js (500-line rule): the engine only
// delegates save/load and keeps the live queue in memory.
//
// The API is deliberately track-agnostic (arrays in, arrays out), so the
// engine can feed it queue snapshots and read back playlists without
// sharing state.

const PLAYLISTS_KEY = "gearshell.music.playlists.v1";

let playlistsCache = null; // [{ id, name, tracks, ts }]

function load() {
  if (playlistsCache) return playlistsCache;
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    playlistsCache = raw ? JSON.parse(raw) : [];
  } catch {
    playlistsCache = [];
  }
  return playlistsCache;
}

function persist(list) {
  playlistsCache = list;
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
  } catch {
    // storage full or unavailable; the in-memory list still works
  }
}

// A compact [{ id, name, count, ts }] listing for the panel / API.
export function listPlaylists() {
  return load().map((p) => ({
    id: p.id,
    name: p.name,
    count: (p.tracks || []).length,
    ts: p.ts,
  }));
}

export function getPlaylist(id) {
  const playlist = load().find((p) => p.id === id);
  return playlist
    ? { id: playlist.id, name: playlist.name, tracks: playlist.tracks }
    : null;
}

// Saves (or overwrites, by name or id) a named playlist.
export function savePlaylist(name, tracks) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "a name is required" };
  const list = load();
  const record = {
    id: list.find((p) => p.name === cleanName)?.id ||
      `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    tracks: (tracks || []).map((t) => ({ src: t.src, title: t.title })),
    ts: Date.now(),
  };
  const index = list.findIndex((p) => p.id === record.id);
  if (index >= 0) list[index] = record;
  else list.push(record);
  persist(list);
  return { ok: true, id: record.id, count: record.tracks.length };
}

export function renamePlaylist(id, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "a name is required" };
  const playlist = load().find((p) => p.id === id);
  if (!playlist) return { ok: false, error: "playlist not found" };
  playlist.name = cleanName;
  playlist.ts = Date.now();
  persist(load());
  return { ok: true };
}

export function deletePlaylist(id) {
  persist(load().filter((p) => p.id !== id));
  return { ok: true };
}
