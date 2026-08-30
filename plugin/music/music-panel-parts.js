// music-panel-parts.js — presentational pieces for the Music panel.
//
// Split out of music.js (500-line rule): every component here is a pure
// view over engine state — transport buttons, seek bar, drag-reorderable
// queue list, named-playlist toolbar, recently-played list with play
// counts, and the synced lyrics view. music.js owns the state wiring.

import React, { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TransportButton({ title, icon, onClick, disabled }) {
  return html`
    <button
      type="button"
      className="music-transport"
      title=${title}
      aria-label=${title}
      onClick=${onClick}
      disabled=${disabled}
    >
      <${icon} size=${16} aria-hidden=${true}/>
    </button>
  `;
}

const LOOP_META = {
  off: { icon: Repeat, label: "Loop off" },
  all: { icon: Repeat, label: "Loop all" },
  one: { icon: Repeat1, label: "Loop one" },
};

export function LoopButton({ loopMode, onCycle }) {
  const meta = LOOP_META[loopMode] || LOOP_META.off;
  return html`
    <button
      type="button"
      className=${`music-transport music-loop ${
        loopMode === "off" ? "music-loop-off" : ""
      }`}
      title=${meta.label}
      aria-label=${meta.label}
      aria-pressed=${loopMode !== "off"}
      onClick=${onCycle}
    >
      <${meta.icon} size=${16} aria-hidden=${true}/>
    </button>
  `;
}

export function ShuffleButton({ shuffle, onToggle }) {
  return html`
    <button
      type="button"
      className=${`music-transport music-shuffle ${
        shuffle ? "" : "music-loop-off"
      }`}
      title=${shuffle ? "Shuffle on" : "Shuffle off"}
      aria-label=${shuffle ? "Shuffle on" : "Shuffle off"}
      aria-pressed=${shuffle}
      onClick=${onToggle}
    >
      <${Shuffle} size=${16} aria-hidden=${true}/>
    </button>
  `;
}

export function renderNowPlaying(current) {
  if (!current) {
    return html`
      <p className="music-empty">Nothing playing. Enter a URL, a VFS path, or pick a file from the filesystem.</p>
    `;
  }
  const meta = [current.artist, current.album].filter(Boolean).join(" · ");
  return html`
    <div>
      <div className="music-now-title">${current.title}</div>
      ${meta && html`<p className="music-now-meta">${meta}</p>`}
      ${current.error
        ? html`<p className="music-error">${current.error}</p>`
        : html`<p className="music-progress">${current.playing ? "playing" : "paused"}</p>`}
    </div>
  `;
}

// Seek slider: the local `drag` value tracks the thumb while the user
// scrubs (timeupdate re-renders would fight it); on release / blur the
// engine is asked to jump there.
export function MusicSeekBar({ current, time, onSeek }) {
  const [drag, setDrag] = useState(null);
  if (!current || !Number.isFinite(current.duration) || current.duration <= 0) {
    return null;
  }
  const shown = drag ?? Math.min(time, current.duration);
  const commit = (event) => {
    onSeek(Number(event.target.value));
    setDrag(null);
  };
  return html`
    <div className="music-seek">
      <input
        className="music-seek-slider"
        type="range"
        min=${0}
        max=${Math.floor(current.duration)}
        step=${1}
        value=${shown}
        aria-label="Seek"
        onChange=${(event) => setDrag(Number(event.target.value))}
        onPointerUp=${commit}
        onPointerCancel=${commit}
        onBlur=${commit}
        onKeyUp=${(event) => {
          if (
            event.key === "ArrowLeft" || event.key === "ArrowRight" ||
            event.key === "Home" || event.key === "End"
          ) {
            commit(event);
          }
        }}
      />
      <span className="music-seek-time">${formatTime(shown)} / ${formatTime(current.duration)}</span>
    </div>
  `;
}

export function renderControls(state, handlers) {
  const current = state?.current || null;
  return html`
    <div className="music-controls">
      <${ShuffleButton} shuffle=${!!state?.shuffle} onToggle=${handlers.toggleShuffle}/>
      ${TransportButton({
        title: "Previous",
        icon: SkipBack,
        onClick: handlers.prev,
        disabled: !current,
      })}
      ${TransportButton({
        title: current?.playing ? "Pause" : "Play",
        icon: current?.playing ? Pause : Play,
        onClick: handlers.pauseResume,
        disabled: !current,
      })}
      ${TransportButton({
        title: "Next",
        icon: SkipForward,
        onClick: handlers.next,
        disabled: !current,
      })}
      ${TransportButton({
        title: "Stop",
        icon: Square,
        onClick: handlers.stop,
        disabled: !current,
      })}
      <${LoopButton} loopMode=${state?.loopMode || "off"} onCycle=${handlers.cycleLoop}/>
    </div>
  `;
}

export function renderUrlRow(url, setUrl, onPlay, onBrowse) {
  return html`
    <div className="music-url-row">
      <input
        className="music-url"
        type="url"
        placeholder="https://… or /opfs/home/song.mp3"
        value=${url}
        aria-label="Audio URL or VFS path"
        onChange=${(event) => setUrl(event.target.value)}
        onKeyDown=${(event) => {
          if (event.key === "Enter") onPlay();
        }}
      />
      <button type="button" className="music-play-btn" onClick=${onPlay}>Play</button>
      <button
        type="button"
        className="music-play-btn"
        title="Pick audio files from the filesystem"
        onClick=${onBrowse}
      >
        <${FolderOpen} size=${14} aria-hidden=${true}/>
        Browse…
      </button>
    </div>
  `;
}

export function renderHistory(history, onPick) {
  return html`
    <div className="music-history">
      <div className="music-section-head">
        <h3>Recently played</h3>
      </div>
      ${history?.length
        ? history.map((entry) =>
          html`
            <button
              key=${`${entry.ts}-${entry.src}`}
              type="button"
              className="music-history-row"
              title=${entry.src}
              onClick=${() => onPick(entry)}
            >
              <span className="music-history-title">
                ${entry.title}
                ${(entry.count || 1) > 1 &&
                  html`<span className="music-history-count">×${entry.count}</span>`}
              </span>
              <span className="music-history-src">${entry.src}</span>
            </button>
          `,
        )
        : html`<p className="music-empty">No history yet.</p>`}
    </div>
  `;
}

// Synced lyrics with the active line auto-centered. Falls back to a
// static listing when the source has no timestamps (rare: parseLrc only
// yields timed lines; embedded USLT is plain text and renders static).
export function LyricsView({ lyrics, time }) {
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
  return html`
    <div className="music-lyrics">
      ${lyrics.map((line, index) =>
        html`<p
          key=${index}
          ref=${index === active ? activeRef : null}
          className=${index === active
            ? "music-lyric music-lyric-active"
            : "music-lyric"}
        >${line.text || "\u00A0"}</p>`,
      )}
    </div>
  `;
}

export function renderLyricsSection(lyrics, time) {
  if (!lyrics || lyrics.length === 0) return null;
  const synced = typeof lyrics[0]?.time === "number";
  return html`
    <div className="music-lyrics-section">
      <div className="music-section-head">
        <h3>Lyrics</h3>
      </div>
      ${synced
        ? html`<${LyricsView} lyrics=${lyrics} time=${time}/>`
        : html`
            <div className="music-lyrics">
              ${lyrics.map((line, index) =>
                html`<p key=${index} className="music-lyric">${line.text || "\u00A0"}</p>`,
              )}
            </div>
          `}
    </div>
  `;
}
