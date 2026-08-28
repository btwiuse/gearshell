// music-engine.js — page-wide music playback singleton (M4).
//
// Owns one <audio> element shared by the Music panel and the gctl
// music.* API, so both drive the same playback state. The panel is a
// user-gesture surface (autoplay policy); the API entry musicPlay is
// synchronous (jsfs bridge), so VFS paths resolve asynchronously and
// the panel catches up through MUSIC_STATE_EVENT.

import { getWanixRoot } from "./app-state.js?v=20260826.2";

export const MUSIC_STATE_EVENT = "GearShellMusicStateChanged";

let audio = null;
let current = null; // { src, title, url, blobUrl, startedAt, error? }
let history = []; // newest first: { src, title, ts }
const HISTORY_LIMIT = 20;

function emitState() {
  window.dispatchEvent(new CustomEvent(MUSIC_STATE_EVENT));
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  for (const event of ["play", "pause", "ended", "error"]) {
    audio.addEventListener(event, emitState);
  }
  return audio;
}

function isRemote(src) {
  return /^https?:\/\//i.test(src);
}

function recordHistory(src, title) {
  history.unshift({ src, title, ts: Date.now() });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
}

export function musicPlay(src, title) {
  const el = ensureAudio();
  const clean = String(src || "").trim();
  if (!clean) return { ok: false, error: "a URL or VFS path is required" };
  if (current?.blobUrl) URL.revokeObjectURL(current.blobUrl);
  current = {
    src: clean,
    title: title || (isRemote(clean) ? clean : clean.split("/").pop()) || clean,
    url: isRemote(clean) ? clean : "",
    startedAt: Date.now(),
  };
  recordHistory(clean, current.title);
  if (isRemote(clean)) {
    el.src = clean;
    // autoplay may be blocked without a user gesture (agent calls
    // carry none); the panel surfaces the paused state.
    el.play().catch(() => {});
  } else {
    getWanixRoot()?.readFile(clean)
      .then((data) => {
        if (current?.src !== clean) return; // superseded by a newer play
        const blobUrl = URL.createObjectURL(
          new Blob([data], {
            type: "audio/*",
          }),
        );
        current.url = blobUrl;
        current.blobUrl = blobUrl;
        el.src = blobUrl;
        el.play().catch(() => {});
        emitState();
      })
      .catch((error) => {
        if (current?.src !== clean) return;
        current.error = error?.message || String(error);
        emitState();
      });
  }
  emitState();
  return {
    ok: true,
    src: clean,
    title: current.title,
    // jsfs bridge is sync-only: remote URLs start immediately, VFS
    // paths resolve asynchronously (async: true; catch up via
    // nowPlaying / MUSIC_STATE_EVENT).
    async: !isRemote(clean),
    playing: !el.paused,
  };
}

export function musicPause() {
  audio?.pause();
  return { ok: true };
}

export function musicResume() {
  const el = ensureAudio();
  el.play().catch(() => {});
  return { ok: true };
}

export function musicStop() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (current?.blobUrl) URL.revokeObjectURL(current.blobUrl);
  current = null;
  emitState();
  return { ok: true };
}

export function musicNowPlaying() {
  const el = audio;
  const playing = !!el && !el.paused && !el.ended && !!el.src;
  return {
    ok: true,
    current: current
      ? {
        src: current.src,
        title: current.title,
        playing,
        ...(current.error ? { error: current.error } : {}),
        ...(el && el.src && Number.isFinite(el.duration)
          ? { time: el.currentTime, duration: el.duration }
          : {}),
      }
      : null,
    history: history.map((entry) => ({ ...entry })),
  };
}

export const musicApi = {
  play: musicPlay,
  pause: musicPause,
  resume: musicResume,
  stop: musicStop,
  nowPlaying: musicNowPlaying,
};
