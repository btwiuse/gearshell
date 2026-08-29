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
import { ArrowUp, ChevronRight, File, Folder, Play, X } from "lucide-react";
import { getWanixRoot } from "./app-state.js?v=20260826.2";
import {
  filesystemPathJoin,
  filesystemPathParent,
  normalizeFilesystemPath,
} from "./files-path.js?v=20260826.70";

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

function PickerRow({
  entry,
  mode,
  checked,
  selected,
  onOpen,
  onToggle,
  onPlaySingle,
}) {
  const Icon = entry.isDirectory ? Folder : File;
  const label = entry.isDirectory ? "Open directory" : "Pick file";
  return React.createElement(
    "div",
    {
      className:
        `vfs-picker-row ${entry.isDirectory ? "vfs-picker-row-dir" : ""}` +
        (selected ? " vfs-picker-row-selected" : ""),
      role: "button",
      tabIndex: 0,
      title: label,
      onClick: () => (entry.isDirectory ? onOpen() : onToggle(entry)),
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (entry.isDirectory) onOpen();
          else onToggle(entry);
        }
      },
    },
    React.createElement(Icon, {
      size: 15,
      className: "vfs-picker-row-icon",
      "aria-hidden": true,
    }),
    React.createElement(
      "span",
      { className: "vfs-picker-row-name" },
      entry.name,
    ),
    !entry.isDirectory && mode === "multi" &&
      React.createElement(Play, {
        size: 14,
        className: "vfs-picker-row-play",
        "aria-label": "Play now",
        onClick: (event) => {
          event.stopPropagation();
          onPlaySingle(entry);
        },
      }),
    !entry.isDirectory && mode === "multi" && checked &&
      React.createElement("span", { className: "vfs-picker-row-check" }, "✓"),
  );
}

function PickerCrumbs({ path, navigate }) {
  const segments = path === "." ? [] : path.split("/");
  return React.createElement(
    "div",
    { className: "vfs-picker-crumbs" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "vfs-picker-crumb",
        onClick: () => navigate("."),
      },
      "/",
    ),
    segments.map((segment, index) =>
      React.createElement(
        "span",
        { key: index, className: "vfs-picker-crumb-wrap" },
        React.createElement(ChevronRight, {
          size: 12,
          className: "vfs-picker-crumb-sep",
          "aria-hidden": true,
        }),
        React.createElement(
          "button",
          {
            type: "button",
            className: "vfs-picker-crumb",
            onClick: () => navigate(segments.slice(0, index + 1).join("/")),
          },
          segment,
        ),
      )
    ),
  );
}

function PickerToolbar({ path, draft, setDraft, submitPath, goUp, navigate }) {
  return React.createElement(
    "div",
    { className: "vfs-picker-toolbar" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "vfs-picker-up",
        title: "Up one directory",
        "aria-label": "Up one directory",
        disabled: path === ".",
        onClick: goUp,
      },
      React.createElement(ArrowUp, { size: 14, "aria-hidden": true }),
    ),
    React.createElement(PickerCrumbs, { path, navigate }),
    React.createElement("input", {
      className: "vfs-picker-path",
      type: "text",
      spellCheck: false,
      value: draft,
      "aria-label": "Path",
      onChange: (event) => setDraft(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitPath();
        }
      },
    }),
  );
}

function PickerBody({
  loading,
  error,
  entries,
  mode,
  marked,
  selectedIndex,
  navigate,
  pickSingle,
  toggleMark,
  onPlaySingle,
}) {
  if (loading) {
    return React.createElement(
      "p",
      { className: "vfs-picker-status" },
      "Loading…",
    );
  }
  if (error) {
    return React.createElement("p", { className: "vfs-picker-error" }, error);
  }
  if (entries.length === 0) {
    return React.createElement(
      "p",
      { className: "vfs-picker-status" },
      "Empty directory",
    );
  }
  return entries.map((entry, index) =>
    React.createElement(PickerRow, {
      key: entry.path,
      entry,
      mode,
      checked: marked.has(entry.path),
      selected: index === selectedIndex,
      onOpen: () => navigate(entry.path),
      onToggle: (target) =>
        mode === "single" ? pickSingle(target) : toggleMark(target),
      onPlaySingle,
    })
  );
}

function PickerFooter({ marked, actions }) {
  return React.createElement(
    "div",
    { className: "vfs-picker-footer" },
    React.createElement(
      "span",
      { className: "vfs-picker-count" },
      marked.length === 0 ? "No files selected" : `${marked.length} selected`,
    ),
    React.createElement(
      "div",
      { className: "vfs-picker-actions" },
      actions.map((action, index) =>
        React.createElement(
          "button",
          {
            type: "button",
            key: index,
            className: `vfs-picker-btn ${
              action.primary ? "vfs-picker-btn-primary" : ""
            }`,
            disabled: marked.length === 0,
            onClick: () => action.onPick(marked),
          },
          typeof action.label === "function"
            ? action.label(marked.length)
            : action.label,
        )
      ),
    ),
  );
}

// Backdrop + dialog shell with the title bar; children fill the body.
function VfsPickerDialog({ title, onClose, children }) {
  return React.createElement(
    "div",
    {
      className: "vfs-picker-backdrop",
      onClick: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
    },
    React.createElement(
      "div",
      { className: "vfs-picker", role: "dialog", "aria-label": title },
      React.createElement(
        "div",
        { className: "vfs-picker-header" },
        React.createElement("h3", null, title),
        React.createElement(
          "button",
          {
            type: "button",
            className: "vfs-picker-close",
            "aria-label": "Close",
            onClick: onClose,
          },
          React.createElement(X, { size: 15, "aria-hidden": true }),
        ),
      ),
      ...children,
    ),
  );
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
  return React.createElement(VfsPickerDialog, { title, onClose, children });
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
    React.createElement(PickerToolbar, {
      path,
      draft,
      setDraft,
      submitPath,
      goUp,
      navigate,
    }),
    React.createElement(
      "div",
      { className: "vfs-picker-body" },
      React.createElement(PickerBody, {
        loading,
        error,
        entries,
        mode,
        marked,
        selectedIndex,
        navigate,
        pickSingle,
        toggleMark,
        onPlaySingle: onPlaySingle ||
          ((entry) => actions[0]?.onPick([entry])),
      }),
    ),
    mode === "multi" &&
    React.createElement(PickerFooter, {
      marked: markedEntries,
      actions,
    }),
  ];
}
