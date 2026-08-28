// Music panel: URL / VFS-path player with transport controls and a
// recently played list, backed by the music-engine singleton so the
// gctl music.* API and this panel share one <audio> element.
//
// Dependency-injection shim mirrors runtime.js / files.js: app.js
// calls initMusic(dependencies) at boot; the panel reads
// rememberOpenPanel lazily via musicDep.

import React, { useEffect, useState } from "react";
import { Music2, Pause, Play, Square } from "lucide-react";
import {
  MUSIC_STATE_EVENT,
  musicNowPlaying,
  musicPause,
  musicPlay,
  musicResume,
  musicStop,
} from "./music-engine.js?v=20260829.3";

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

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
      "Nothing playing. Enter a URL or a VFS path below.",
    );
  }
  const progress = current.time != null
    ? `${formatTime(current.time)} / ${formatTime(current.duration)}`
    : "";
  return React.createElement(
    "div",
    null,
    React.createElement("div", { className: "music-now-title" }, current.title),
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

function renderControls(current, onPauseResume, onStop) {
  return React.createElement(
    "div",
    { className: "music-controls" },
    TransportButton({
      title: current?.playing ? "Pause" : "Play",
      icon: current?.playing ? Pause : Play,
      onClick: onPauseResume,
      disabled: !current,
    }),
    TransportButton({
      title: "Stop",
      icon: Square,
      onClick: onStop,
      disabled: !current,
    }),
  );
}

function renderUrlRow(url, setUrl, onPlay) {
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
  );
}

function HistoryRow({ entry, onPick }) {
  return React.createElement(
    "button",
    {
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
    React.createElement("span", { className: "music-history-src" }, entry.src),
  );
}

function renderHistory(history, onPick) {
  return React.createElement(
    "div",
    { className: "music-history" },
    React.createElement("h3", null, "Recently played"),
    history?.length
      ? history.map((entry) =>
        React.createElement(HistoryRow, {
          key: `${entry.ts}-${entry.src}`,
          entry,
          onPick,
        })
      )
      : React.createElement(
        "p",
        { className: "music-empty" },
        "No history yet.",
      ),
  );
}

function renderMusicPanel(
  state,
  url,
  setUrl,
  playUrl,
  pick,
  pauseResume,
  stop,
) {
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
      renderNowPlaying(state?.current || null),
    ),
    renderControls(state?.current || null, pauseResume, stop),
    renderUrlRow(url, setUrl, playUrl),
    renderHistory(state?.history, pick),
  );
}

export function MusicPanel() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState(() => musicNowPlaying());

  useEffect(() => {
    const refresh = () => setState(musicNowPlaying());
    window.addEventListener(MUSIC_STATE_EVENT, refresh);
    return () => window.removeEventListener(MUSIC_STATE_EVENT, refresh);
  }, []);

  const playUrl = () => {
    const target = url.trim();
    if (!target) return;
    musicPlay(target);
    setUrl("");
    setState(musicNowPlaying());
  };

  const pick = (entry) => {
    musicPlay(entry.src, entry.title);
    setState(musicNowPlaying());
  };

  const pauseResume = () => {
    if (state?.current?.playing) musicPause();
    else musicResume();
    setState(musicNowPlaying());
  };

  const stop = () => {
    musicStop();
    setState(musicNowPlaying());
  };

  return renderMusicPanel(
    state,
    url,
    setUrl,
    playUrl,
    pick,
    pauseResume,
    stop,
  );
}

// === Panel registration ===
let musicIdCounter = 0;

export function addMusicPanel(api, group) {
  const id = ++musicIdCounter;
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
