// Music panel: a small NetEase-style player over the music-engine
// singleton (shared with the gctl music.* API).
//
// Since round-23 the panel covers the everyday player flows: pick audio
// files from the Wanix FS through the reusable VfsFilePicker, build a
// playlist (queue) with play-next/prev + three loop modes, and show
// metadata + synced lyrics (ID3v2 USLT frames or .lrc sidecars) when
// the file carries them.

import React, { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import { nextPanelIndex } from "./app-panel-ids.js?v=20260828.76";
import {
  MUSIC_STATE_EVENT,
  MUSIC_TIME_EVENT,
  musicClearQueue,
  musicEnqueue,
  musicNext,
  musicNowPlaying,
  musicPause,
  musicPlay,
  musicPlayQueue,
  musicPrev,
  musicRemoveFromQueue,
  musicResume,
  musicSetLoop,
  musicStop,
} from "./music-engine.js?v=20260829.5";
import { isAudioFilePath, VfsFilePicker } from "./vfs-picker.js?v=20260829.8";

let __musicDeps = null;
export function initMusic(dependencies) {
  __musicDeps = dependencies;
}
function musicDep(name) {
  if (__musicDeps == null) {
    throw new Error(
      "music: initMusic() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __musicDeps[name];
  if (value === undefined) {
    throw new Error(`music: missing dependency ${name}`);
  }
  return value;
}

const LOOP_CYCLE = ["off", "all", "one"];
const LOOP_META = {
  off: { icon: Repeat, label: "Loop off" },
  all: { icon: Repeat, label: "Loop all" },
  one: { icon: Repeat1, label: "Loop one" },
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function entryToTrack(entry) {
  return { src: entry.path, title: entry.name };
}

function TransportButton({ title, icon, onClick, disabled }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "music-transport",
      title,
      "aria-label": title,
      onClick,
      disabled,
    },
    React.createElement(icon, { size: 16, "aria-hidden": true }),
  );
}

function renderNowPlaying(current) {
  if (!current) {
    return React.createElement(
      "p",
      { className: "music-empty" },
      "Nothing playing. Enter a URL, a VFS path, or pick a file from the filesystem.",
    );
  }
  const meta = [current.artist, current.album].filter(Boolean).join(" · ");
  const progress = current.time != null
    ? `${formatTime(current.time)} / ${formatTime(current.duration)}`
    : "";
  return React.createElement(
    "div",
    null,
    React.createElement("div", { className: "music-now-title" }, current.title),
    meta && React.createElement("p", { className: "music-now-meta" }, meta),
    current.error
      ? React.createElement("p", { className: "music-error" }, current.error)
      : React.createElement(
        "p",
        { className: "music-progress" },
        `${current.playing ? "playing" : "paused"}${
          progress ? " · " + progress : ""
        }`,
      ),
  );
}

function LoopButton({ loopMode, onCycle }) {
  const meta = LOOP_META[loopMode] || LOOP_META.off;
  return React.createElement(
    "button",
    {
      type: "button",
      className: `music-transport music-loop ${
        loopMode === "off" ? "music-loop-off" : ""
      }`,
      title: meta.label,
      "aria-label": meta.label,
      "aria-pressed": loopMode !== "off",
      onClick: onCycle,
    },
    React.createElement(meta.icon, { size: 16, "aria-hidden": true }),
  );
}

function renderControls(state, handlers) {
  const current = state?.current || null;
  return React.createElement(
    "div",
    { className: "music-controls" },
    TransportButton({
      title: "Previous",
      icon: SkipBack,
      onClick: handlers.prev,
      disabled: !current,
    }),
    TransportButton({
      title: current?.playing ? "Pause" : "Play",
      icon: current?.playing ? Pause : Play,
      onClick: handlers.pauseResume,
      disabled: !current,
    }),
    TransportButton({
      title: "Next",
      icon: SkipForward,
      onClick: handlers.next,
      disabled: !current,
    }),
    TransportButton({
      title: "Stop",
      icon: Square,
      onClick: handlers.stop,
      disabled: !current,
    }),
    React.createElement(LoopButton, {
      loopMode: state?.loopMode || "off",
      onCycle: handlers.cycleLoop,
    }),
  );
}

function renderUrlRow(url, setUrl, onPlay, onBrowse) {
  return React.createElement(
    "div",
    { className: "music-url-row" },
    React.createElement("input", {
      className: "music-url",
      type: "url",
      placeholder: "https://… or /opfs/home/song.mp3",
      value: url,
      "aria-label": "Audio URL or VFS path",
      onChange: (event) => setUrl(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") onPlay();
      },
    }),
    React.createElement(
      "button",
      { type: "button", className: "music-play-btn", onClick: onPlay },
      "Play",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "music-play-btn",
        title: "Pick audio files from the filesystem",
        onClick: onBrowse,
      },
      React.createElement(FolderOpen, { size: 14, "aria-hidden": true }),
      " Browse…",
    ),
  );
}

function QueueRow({ track, index, active, onPickAt, onRemoveAt }) {
  return React.createElement(
    "div",
    {
      className: `music-queue-row ${active ? "music-queue-row-active" : ""}`,
      role: "button",
      tabIndex: 0,
      title: track.src,
      onClick: () => onPickAt(index),
      onKeyDown: (event) => {
        if (event.key === "Enter") onPickAt(index);
      },
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

function renderQueue(queue, queueIndex, onPickAt, onRemoveAt, onClear) {
  return React.createElement(
    "div",
    { className: "music-queue" },
    React.createElement(
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
    ),
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
          onPickAt,
          onRemoveAt,
        })
      ),
  );
}

function renderHistory(history, onPick) {
  return React.createElement(
    "div",
    { className: "music-history" },
    React.createElement(
      "div",
      { className: "music-section-head" },
      React.createElement("h3", null, "Recently played"),
    ),
    history?.length
      ? history.map((entry) =>
        React.createElement(
          "button",
          {
            key: `${entry.ts}-${entry.src}`,
            type: "button",
            className: "music-history-row",
            title: entry.src,
            onClick: () => onPick(entry),
          },
          React.createElement(
            "span",
            { className: "music-history-title" },
            entry.title,
          ),
          React.createElement(
            "span",
            { className: "music-history-src" },
            entry.src,
          ),
        )
      )
      : React.createElement(
        "p",
        { className: "music-empty" },
        "No history yet.",
      ),
  );
}

// Synced lyrics with the active line auto-centered. Falls back to a
// static listing when the source has no timestamps (rare: parseLrc only
// yields timed lines; embedded USLT is plain text and renders static).
function LyricsView({ lyrics, time }) {
  const activeRef = useRef(null);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let index = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (time >= lyrics[i].time) index = i;
      else break;
    }
    setActive(index);
  }, [lyrics, time]);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);
  return React.createElement(
    "div",
    { className: "music-lyrics" },
    lyrics.map((line, index) =>
      React.createElement(
        "p",
        {
          key: index,
          ref: index === active ? activeRef : null,
          className: index === active
            ? "music-lyric music-lyric-active"
            : "music-lyric",
        },
        line.text || "\u00A0",
      )
    ),
  );
}

function renderLyricsSection(lyrics, time) {
  if (!lyrics || lyrics.length === 0) return null;
  const synced = typeof lyrics[0]?.time === "number";
  return React.createElement(
    "div",
    { className: "music-lyrics-section" },
    React.createElement(
      "div",
      { className: "music-section-head" },
      React.createElement("h3", null, "Lyrics"),
    ),
    synced
      ? React.createElement(LyricsView, { lyrics, time })
      : React.createElement(
        "div",
        { className: "music-lyrics" },
        lyrics.map((line, index) =>
          React.createElement(
            "p",
            { key: index, className: "music-lyric" },
            line.text || "\u00A0",
          )
        ),
      ),
  );
}

function renderMusicPanel(state, time, url, setUrl, handlers) {
  const current = state?.current || null;
  return React.createElement(
    "div",
    { className: "music-panel panel-content" },
    React.createElement(
      "div",
      { className: "music-header" },
      React.createElement(Music2, { size: 18, "aria-hidden": true }),
      React.createElement("h2", null, "Music"),
    ),
    React.createElement(
      "div",
      { className: "music-now" },
      renderNowPlaying(current),
    ),
    renderControls(state, handlers),
    renderUrlRow(url, setUrl, handlers.playUrl, handlers.browse),
    renderLyricsSection(current?.lyrics, time),
    renderQueue(
      state?.queue || [],
      state?.queueIndex ?? -1,
      handlers.pickQueue,
      handlers.removeAt,
      handlers.clearQueue,
    ),
    renderHistory(state?.history, handlers.pickHistory),
  );
}

// Engine state + lyric-clock subscriptions, kept in one hook so the
// panel component stays under the line budget.
function useMusicSession() {
  const [state, setState] = useState(() => musicNowPlaying());
  const [time, setTime] = useState(0);
  useEffect(() => {
    const refresh = () => {
      const next = musicNowPlaying();
      setState(next);
      if (next.current?.time != null) setTime(next.current.time);
    };
    const onTime = (event) => setTime(event.detail?.time ?? 0);
    window.addEventListener(MUSIC_STATE_EVENT, refresh);
    window.addEventListener(MUSIC_TIME_EVENT, onTime);
    return () => {
      window.removeEventListener(MUSIC_STATE_EVENT, refresh);
      window.removeEventListener(MUSIC_TIME_EVENT, onTime);
    };
  }, []);
  return { state, setState, time };
}

function makeTransportHandlers(state, refreshState) {
  return {
    pauseResume: () => {
      if (state?.current?.playing) musicPause();
      else musicResume();
      refreshState();
    },
    stop: () => {
      musicStop();
      refreshState();
    },
    next: () => {
      musicNext();
      refreshState();
    },
    prev: () => {
      musicPrev();
      refreshState();
    },
    cycleLoop: () => {
      const next = LOOP_CYCLE[
        (LOOP_CYCLE.indexOf(state?.loopMode || "off") + 1) % LOOP_CYCLE.length
      ];
      musicSetLoop(next);
      refreshState();
    },
  };
}

function makePlaylistHandlers(state, refreshState) {
  return {
    pickQueue: (index) => {
      musicPlayQueue(state.queue, index);
      refreshState();
    },
    pickHistory: (entry) => {
      musicPlay(entry.src, entry.title);
      refreshState();
    },
    removeAt: (index) => {
      musicRemoveFromQueue(index);
      refreshState();
    },
    clearQueue: () => {
      musicClearQueue();
      refreshState();
    },
  };
}

function renderMusicPicker(
  { pickerOpen, onClose, playSingle, playAll, enqueueAll },
) {
  if (!pickerOpen) return null;
  return React.createElement(VfsFilePicker, {
    title: "Pick audio from the filesystem",
    startPath: ".",
    filter: isAudioFilePath,
    mode: "multi",
    onClose,
    onPlaySingle: playSingle,
    actions: [
      {
        label: (count) => `Play ${count}`,
        primary: true,
        onPick: playAll,
      },
      {
        label: (count) => `Add ${count} to playlist`,
        onPick: enqueueAll,
      },
    ],
  });
}

export function MusicPanel() {
  const [url, setUrl] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { state, setState, time } = useMusicSession();
  const refreshState = () => setState(musicNowPlaying());

  const playUrl = () => {
    const target = url.trim();
    if (!target) return;
    musicPlay(target);
    setUrl("");
    refreshState();
  };
  const closePickerAnd = (action) => {
    setPickerOpen(false);
    action();
    refreshState();
  };
  const playSingle = (entry) =>
    closePickerAnd(() => musicPlayQueue([entryToTrack(entry)]));
  const playAll = (entries) =>
    closePickerAnd(() => musicPlayQueue(entries.map(entryToTrack)));
  const enqueueAll = (entries) =>
    closePickerAnd(() => musicEnqueue(entries.map(entryToTrack)));

  const handlers = {
    ...makeTransportHandlers(state, refreshState),
    playUrl,
    browse: () => setPickerOpen(true),
    ...makePlaylistHandlers(state, refreshState),
  };

  return React.createElement(
    React.Fragment,
    null,
    renderMusicPanel(state, time, url, setUrl, handlers),
    renderMusicPicker({
      pickerOpen,
      onClose: () => setPickerOpen(false),
      playSingle,
      playAll,
      enqueueAll,
    }),
  );
}

// === Panel registration ===

export function addMusicPanel(api, group) {
  const id = nextPanelIndex("music");
  const panel = api.addPanel({
    id: `music-${id}`,
    component: "music",
    params: { musicId: id, panelType: "music" },
    title: `Music ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  musicDep("rememberOpenPanel")(panel, { component: "music" });
  panel.api.setActive();
  return panel;
}
