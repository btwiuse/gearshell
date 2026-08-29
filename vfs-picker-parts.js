// vfs-picker-parts.js — presentational rows for the VFS picker modal
// (500-line split out of vfs-picker.js). Pure props-in/JSX-out; all
// state and navigation lives in vfs-picker.js.

import React from "react";
import { ArrowUp, ChevronRight, File, Folder, Play } from "lucide-react";

export function PickerRow({
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

export function PickerCrumbs({ path, navigate }) {
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

export function PickerToolbar({ path, draft, setDraft, submitPath, goUp, navigate }) {
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

export function PickerBody({
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

export function PickerFooter({ marked, actions }) {
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
