// Music panel: a small NetEase-style player over the music-engine
// singleton (shared with the gear music.* API).
//
// The panel covers the everyday player flows: pick audio files from the
// Wanix FS through the reusable VfsFilePicker, build a playlist (queue)
// with drag-reorder, shuffle + three loop modes, seek, named playlists
// (save / load / rename / delete), and synced lyrics + metadata.
// Presentational pieces live in music-panel-parts.js (500-line rule);
// this module owns the state wiring. Panel registration moved to
// music-plugin.js — Music now loads through the plugin kernel
// (WISHLIST #9), the same path a third-party panel uses.

import React, { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import {
  MUSIC_STATE_EVENT,
  MUSIC_TIME_EVENT,
  musicClearQueue,
  musicDeletePlaylist,
  musicEnqueue,
  musicLoadPlaylist,
  musicNext,
  musicNowPlaying,
  musicPause,
  musicPlay,
  musicPlayQueue,
  musicPrev,
  musicRemoveFromQueue,
  musicRenamePlaylist,
  musicReorderQueue,
  musicResume,
  musicSavePlaylist,
  musicSeek,
  musicSetLoop,
  musicSetShuffle,
  musicStop,
} from "../../music-engine.js?v=20260829.11";
import { isAudioFilePath, VfsFilePicker } from "./vfs-picker.js?v=20260829.11";
import {
  MusicSeekBar,
  renderControls,
  renderHistory,
  renderLyricsSection,
  renderNowPlaying,
  renderUrlRow,
} from "./music-panel-parts.js?v=20260829.12";
import {
  MusicQueueList,
  PlaylistToolbar,
} from "./music-playlist-ui.js?v=20260829.12";

const LOOP_CYCLE = ["off", "all", "one"];

function entryToTrack(entry) {
  return { src: entry.path, title: entry.name };
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
      React.createElement(MusicSeekBar, {
        current,
        time,
        onSeek: handlers.seek,
      }),
    ),
    renderControls(state, handlers),
    renderUrlRow(url, setUrl, handlers.playUrl, handlers.browse),
    renderLyricsSection(current?.lyrics, time),
    React.createElement(PlaylistToolbar, {
      playlists: state?.playlists || [],
      selectedId: handlers.playlistSelectedId,
      onSelect: handlers.playlistSelect,
      onSave: handlers.playlistSave,
      onRename: handlers.playlistRename,
      onDelete: handlers.playlistDelete,
    }),
    React.createElement(MusicQueueList, {
      queue: state?.queue || [],
      queueIndex: state?.queueIndex ?? -1,
      onPickAt: handlers.pickQueue,
      onRemoveAt: handlers.removeAt,
      onClear: handlers.clearQueue,
      onReorder: handlers.reorderQueue,
    }),
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
    toggleShuffle: () => {
      musicSetShuffle(!state?.shuffle);
      refreshState();
    },
    seek: (seconds) => {
      musicSeek(seconds);
      refreshState();
    },
  };
}

function makeQueueHandlers(state, refreshState) {
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
    reorderQueue: (from, to) => {
      musicReorderQueue(from, to);
      refreshState();
    },
  };
}

// Named-playlist operations; prompts keep the toolbar free of inline
// form state. `setPlaylistSelected` is threaded in so deletions can
// clear the dropdown.
function makePlaylistHandlers(refreshState, setPlaylistSelected) {
  return {
    playlistSave: () => {
      const name = window.prompt("Playlist name");
      if (!name) return;
      musicSavePlaylist(name);
      refreshState();
    },
    playlistSelect: (id) => {
      setPlaylistSelected(id || "");
      if (id) musicLoadPlaylist(id);
      refreshState();
    },
    playlistRename: (id) => {
      const name = window.prompt("Rename playlist");
      if (!name) return;
      musicRenamePlaylist(id, name);
      refreshState();
    },
    playlistDelete: (id) => {
      if (!window.confirm("Delete this playlist?")) return;
      musicDeletePlaylist(id);
      setPlaylistSelected("");
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
  const [playlistSelected, setPlaylistSelected] = useState("");
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
    playlistSelectedId: playlistSelected,
    ...makeQueueHandlers(state, refreshState),
    ...makePlaylistHandlers(refreshState, setPlaylistSelected),
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
