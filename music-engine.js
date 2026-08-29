// music-engine.js — page-wide music playback singleton (M4).
//
// Owns one <audio> element shared by the Music panel and the gctl
// music.* API, so both drive the same playback state. The panel is a
// user-gesture surface (autoplay policy); the API entry musicPlay is
// synchronous (jsfs bridge), so VFS paths resolve asynchronously and
// the panel catches up through MUSIC_STATE_EVENT.
//
// The engine also owns the playlist: a queue of tracks with three loop
// modes (off / all / one), auto-advance on 'ended', and best-effort
// metadata + lyrics for VFS files (ID3v2 frames and .lrc sidecars via
// audio-tags.js). MUSIC_TIME_EVENT carries just { time } at ~4 Hz for
// lyric sync, so the panel does not need to re-render whole state.

import { getWanixRoot } from "./app-state.js?v=20260826.2";
import { parseAudioTags, parseLrc } from "./audio-tags.js?v=20260829.7";

export const MUSIC_STATE_EVENT = "GearShellMusicStateChanged";
export const MUSIC_TIME_EVENT = "GearShellMusicTime";

const LOOP_MODES = ["off", "all", "one"];
const HISTORY_LIMIT = 20;

let audio = null;
let current = null; // { src, title, artist?, album?, track?, lyrics?, lyricsKind?, url, blobUrl, startedAt, error? }
let queue = []; // [{ src, title }]
let queueIndex = -1;
let loopMode = "off";
const history = []; // newest first: { src, title, ts }

function emitState() {
  window.dispatchEvent(new CustomEvent(MUSIC_STATE_EVENT));
}

function emitTime() {
  if (audio && Number.isFinite(audio.currentTime)) {
    window.dispatchEvent(
      new CustomEvent(MUSIC_TIME_EVENT, {
        detail: { time: audio.currentTime },
      }),
    );
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  for (const event of ["play", "pause", "ended", "error"]) {
    audio.addEventListener(event, emitState);
  }
  audio.addEventListener("timeupdate", emitTime);
  audio.addEventListener("ended", handleEnded);
  return audio;
}

function handleEnded() {
  if (queue.length === 0) return;
  if (loopMode === "one") {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  const next = queueIndex + 1;
  if (next < queue.length) {
    playQueueAt(next);
  } else if (loopMode === "all") {
    playQueueAt(0);
  } else {
    musicStop();
  }
}

function isRemote(src) {
  return /^https?:\/\//i.test(src);
}

function recordHistory(src, title) {
  history.unshift({ src, title, ts: Date.now() });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
}

function fallbackTitle(src) {
  return isRemote(src) ? src : src.split("/").pop() || src;
}

// Attach ID3v2 metadata + embedded USLT lyrics once the VFS bytes are
// in hand. Guarded by the src check: a newer play supersedes us.
function attachVfsMetadata(clean, data) {
  if (current?.src !== clean) return;
  const tags = parseAudioTags(data);
  if (!tags) return;
  if (tags.title) current.title = tags.title;
  if (tags.artist) current.artist = tags.artist;
  if (tags.album) current.album = tags.album;
  if (tags.track) current.track = tags.track;
  if (tags.lyrics) {
    current.lyrics = tags.lyrics;
    current.lyricsKind = "embedded";
  }
  emitState();
}

// A sibling .lrc sidecar wins over embedded lyrics when both exist.
function attachSidecarLrc(clean) {
  const lrcPath = clean.replace(/\.[^./]+$/, "") + ".lrc";
  if (lrcPath === clean) return;
  getWanixRoot()?.readFile(lrcPath)
    .then((data) => {
      if (current?.src !== clean) return;
      const text = typeof data === "string"
        ? data
        : new TextDecoder().decode(data);
      const lines = parseLrc(text);
      if (lines.length === 0) return;
      current.lyrics = lines;
      current.lyricsKind = "lrc";
      emitState();
    })
    .catch(() => {});
}

function startPlayback(src, title) {
  const el = ensureAudio();
  const clean = String(src || "").trim();
  if (!clean) return { ok: false, error: "a URL or VFS path is required" };
  if (current?.blobUrl) URL.revokeObjectURL(current.blobUrl);
  current = {
    src: clean,
    title: title || fallbackTitle(clean) || clean,
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
          new Blob([data], { type: "audio/*" }),
        );
        current.url = blobUrl;
        current.blobUrl = blobUrl;
        el.src = blobUrl;
        el.play().catch(() => {});
        emitState();
        attachVfsMetadata(clean, data);
        attachSidecarLrc(clean);
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

function tracksFrom(items) {
  return (items || []).map((item) => {
    if (typeof item === "string") {
      return { src: item, title: fallbackTitle(item) };
    }
    return {
      src: item.src,
      title: item.title || fallbackTitle(item.src) || item.src,
    };
  });
}

function playQueueAt(index) {
  if (index < 0 || index >= queue.length) {
    return { ok: false, error: "queue index out of range" };
  }
  queueIndex = index;
  const track = queue[index];
  return startPlayback(track.src, track.title);
}

// === Public API ===

export function musicPlay(src, title) {
  queue = tracksFrom([{ src, title }]);
  queueIndex = 0;
  return startPlayback(src, title);
}

export function musicPlayQueue(tracks, startIndex = 0) {
  queue = tracksFrom(tracks);
  if (queue.length === 0) return { ok: false, error: "no tracks" };
  return playQueueAt(Math.min(startIndex, queue.length - 1));
}

export function musicEnqueue(tracks) {
  const added = tracksFrom(tracks);
  if (added.length === 0) return { ok: false, error: "no tracks" };
  const started = queue.length === 0;
  queue.push(...added);
  if (started) playQueueAt(0);
  emitState();
  return {
    ok: true,
    added: added.length,
    position: queueIndex,
    playing: !!audio && !audio.paused,
  };
}

export function musicNext() {
  if (queue.length === 0) return { ok: false };
  if (loopMode === "one") {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return { ok: true };
  }
  if (queueIndex + 1 < queue.length) return playQueueAt(queueIndex + 1);
  if (loopMode === "all") return playQueueAt(0);
  return musicStop();
}

export function musicPrev() {
  if (queue.length === 0) return { ok: false };
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0; // restart the current track
    return { ok: true };
  }
  const prev = queueIndex - 1;
  if (prev >= 0) return playQueueAt(prev);
  if (loopMode === "all" && queue.length > 1) {
    return playQueueAt(queue.length - 1);
  }
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  return { ok: true };
}

export function musicSetLoop(mode) {
  if (!LOOP_MODES.includes(mode)) {
    return {
      ok: false,
      error: `loop mode must be one of ${LOOP_MODES.join(", ")}`,
    };
  }
  loopMode = mode;
  emitState();
  return { ok: true, loopMode };
}

export function musicRemoveFromQueue(index) {
  if (!Number.isInteger(index) || index < 0 || index >= queue.length) {
    return { ok: false };
  }
  const removedCurrent = index === queueIndex;
  queue.splice(index, 1);
  if (removedCurrent) {
    if (queue.length === 0) {
      queueIndex = -1;
      musicStop();
    } else {
      if (queueIndex >= queue.length) queueIndex = queue.length - 1;
      playQueueAt(queueIndex); // the same slot now holds the next track
    }
  } else if (index < queueIndex) {
    queueIndex -= 1;
  }
  emitState();
  return { ok: true };
}

export function musicClearQueue() {
  queue = [];
  queueIndex = -1;
  emitState();
  return { ok: true };
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
        ...(current.artist ? { artist: current.artist } : {}),
        ...(current.album ? { album: current.album } : {}),
        ...(current.track ? { track: current.track } : {}),
        ...(current.lyrics
          ? { lyrics: current.lyrics, lyricsKind: current.lyricsKind }
          : {}),
        playing,
        ...(current.error ? { error: current.error } : {}),
        ...(el && el.src && Number.isFinite(el.duration)
          ? { time: el.currentTime, duration: el.duration }
          : {}),
      }
      : null,
    queue: queue.map((track) => ({ ...track })),
    queueIndex,
    loopMode,
    history: history.map((entry) => ({ ...entry })),
  };
}

export const musicApi = {
  play: musicPlay,
  playQueue: musicPlayQueue,
  enqueue: musicEnqueue,
  next: musicNext,
  prev: musicPrev,
  setLoop: musicSetLoop,
  removeFromQueue: musicRemoveFromQueue,
  clearQueue: musicClearQueue,
  pause: musicPause,
  resume: musicResume,
  stop: musicStop,
  nowPlaying: musicNowPlaying,
};
