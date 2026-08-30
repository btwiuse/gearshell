// vfs-picker.js — reusable "pick a file from the Wanix FS" infrastructure.
//
// A modal browser over the wanix namespace root (readDir contract: an
// array of bare names, directories carry a trailing "/"), with
// breadcrumb navigation, a direct path input, an optional extension
// filter, and single or multi selection. Deliberately not coupled to
// the Files panel: any surface that needs a VFS path — the Music
// panel's file picker, a future image picker, a workspace file
// selector — renders <VfsFilePicker> and gets the same browsing
// experience with the same path semantics (normalization and joining
// come from files-path.js so nothing ever disagrees on what a path
// means).
//
// Modes:
//   single — a click on a file row calls onPick([entry]) and closes.
//   multi  — a click toggles a checkmark; the footer action buttons
//            receive the checked entries. A per-row play button calls
//            onPlaySingle (falling back to the first action's onPick)
//            so "play this one right now" stays reachable while
//            building a playlist.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { getWanixRoot } from "../../app-state.js";
import {
  filesystemPathJoin,
  filesystemPathParent,
  normalizeFilesystemPath,
} from "../files-path.js";
import {
  PickerBody,
  PickerFooter,
  PickerToolbar,
} from "./vfs-picker-parts.js";

export const AUDIO_EXTENSION_RE =
  /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm)$/i;
export function isAudioFilePath(name) {
  return AUDIO_EXTENSION_RE.test(name);
}

function displayPath(path) {
  return path === "." ? "/" : `/${path}`;
}

// readDir rows: bare names → { name, isDirectory, path }, filtered and
// sorted dirs-first. Also the Files panel's ordering, so both surfaces
// present the same directory.
async function readDirRows(getRoot, path, filter) {
  const names = await getRoot().readDir(path);
  const rows = (Array.isArray(names) ? names : []).map((name) => {
    const isDirectory = name.endsWith("/");
    const base = name.replace(/\/$/, "");
    return {
      name: base,
      isDirectory,
      path: filesystemPathJoin(path, base),
    };
  }).filter((row) => row.isDirectory || !filter || filter(row.name));
  rows.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function useVfsBrowserNav({ path, refresh, setMarked }) {
  const goUp = useCallback(() => {
    if (path === ".") return;
    refresh(filesystemPathParent(path));
  }, [path, refresh]);

  const navigate = useCallback((next) => refresh(next), [refresh]);

  const toggleMark = useCallback((entry) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  }, [setMarked]);

  return { goUp, navigate, toggleMark };
}

function useVfsBrowser({ getRoot, startPath, filter }) {
  const [path, setPath] = useState(() => normalizeFilesystemPath(startPath));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marked, setMarked] = useState(() => new Set());
  const rootRef = useRef(getRoot);
  const filterRef = useRef(filter);
  useEffect(() => {
    rootRef.current = getRoot;
    filterRef.current = filter;
  });

  const refresh = useCallback(async (target) => {
    const targetPath = normalizeFilesystemPath(target);
    setLoading(true);
    setError(null);
    try {
      const rows = await readDirRows(
        rootRef.current,
        targetPath,
        filterRef.current,
      );
      setPath(targetPath);
      setEntries(rows);
      setMarked(new Set());
    } catch (err) {
      setError(err?.message || String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(startPath);
  }, [refresh, startPath]);

  return {
    path,
    entries,
    loading,
    error,
    marked,
    ...useVfsBrowserNav({ path, refresh, setMarked }),
  };
}

// Single-mode keyboard nav: arrows move the highlight, Enter picks.
function usePickerKeys(
  {
    mode,
    entries,
    selectedIndex,
    setSelectedIndex,
    navigate,
    pickSingle,
    onClose,
  },
) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (mode !== "single") return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          if (entries.length === 0) return -1;
          const base = index < 0 ? (delta > 0 ? -1 : 0) : index;
          return Math.max(0, Math.min(entries.length - 1, base + delta));
        });
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        const entry = entries[selectedIndex];
        if (!entry) return;
        event.preventDefault();
        if (entry.isDirectory) navigate(entry.path);
        else pickSingle(entry);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    mode,
    entries,
    selectedIndex,
    setSelectedIndex,
    navigate,
    pickSingle,
    onClose,
  ]);
}


// Backdrop + dialog shell with the title bar; children fill the body.
function VfsPickerDialog({ title, onClose, children }) {
  return html`
    <div
      className="vfs-picker-backdrop"
      onClick=${(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="vfs-picker" role="dialog" aria-label=${title}>
        <div className="vfs-picker-header">
          <h3>${title}</h3>
          <button
            type="button"
            className="vfs-picker-close"
            aria-label="Close"
            onClick=${onClose}
          >
            <${X} size=${15} aria-hidden=${true}/>
          </button>
        </div>
        ${children}
      </div>
    </div>
  `;
}

// Modal browser; mount it conditionally (render only while open) so the
// browsing state starts fresh on every open.
export function VfsFilePicker({
  title = "Pick a file",
  startPath = ".",
  filter,
  getRoot = getWanixRoot,
  mode = "single",
  onPick,
  onPlaySingle,
  actions = [],
  onClose,
}) {
  const browser = useVfsBrowser({ getRoot, startPath, filter });
  const { path, entries, loading, error, marked, toggleMark, navigate, goUp } =
    browser;
  const [draft, setDraft] = useState(() => displayPath(path));
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const markedEntries = entries.filter((entry) => marked.has(entry.path));

  useEffect(() => setDraft(displayPath(path)), [path]);

  const pickSingle = useCallback((entry) => {
    onPick([entry]);
    onClose();
  }, [onPick, onClose]);

  usePickerKeys({
    mode,
    entries,
    selectedIndex,
    setSelectedIndex,
    navigate,
    pickSingle,
    onClose,
  });

  const submitPath = () => {
    const next = normalizeFilesystemPath(draft);
    navigate(next === "." ? "." : next);
  };

  const children = buildPickerChildren({
    path,
    draft,
    setDraft,
    submitPath,
    goUp,
    navigate,
    loading,
    error,
    entries,
    mode,
    marked,
    selectedIndex,
    pickSingle,
    toggleMark,
    onPlaySingle,
    actions,
    markedEntries,
  });
  return html`<${VfsPickerDialog} title=${title} onClose=${onClose}>${children}</${VfsPickerDialog}>`;
}

function buildPickerChildren({
  path,
  draft,
  setDraft,
  submitPath,
  goUp,
  navigate,
  loading,
  error,
  entries,
  mode,
  marked,
  selectedIndex,
  pickSingle,
  toggleMark,
  onPlaySingle,
  actions,
  markedEntries,
}) {
  return [
    html`<${PickerToolbar} path=${path} draft=${draft} setDraft=${setDraft} submitPath=${submitPath} goUp=${goUp} navigate=${navigate}/>`,
    html`
      <div className="vfs-picker-body">
        <${PickerBody}
          loading=${loading}
          error=${error}
          entries=${entries}
          mode=${mode}
          marked=${marked}
          selectedIndex=${selectedIndex}
          navigate=${navigate}
          pickSingle=${pickSingle}
          toggleMark=${toggleMark}
          onPlaySingle=${onPlaySingle ||
            ((entry) => actions[0]?.onPick([entry]))}
        />
      </div>
    `,
    mode === "multi" &&
    html`<${PickerFooter} marked=${markedEntries} actions=${actions}/>`,
  ];
}
