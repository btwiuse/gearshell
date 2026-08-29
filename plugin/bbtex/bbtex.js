// bbtex.js — Bubble Tea playground panel.
//
// Left: every example from the bbtex manifest (63, grouped by theme).
// Right: one embedded terminal per open example (terminal.embed with
// profile.cmd = example id, so the terminal task runs the example binary
// as its command). The examples are declared as wasm deps in the plugin
// manifest and mounted at bin/<id> in every task namespace; each
// terminal's task is the wanix-side worker that execs it. q quits a
// Bubble Tea program; the close button detaches and destroys the session.
// pager reads artichoke.md from its CWD, so its profile starts with
// wd=/preset (the file ships as a plugin preset at preset/artichoke.md).

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getDefaultTerminalProfile } from "../../app-terminal-profiles.js?v=20260826.106";

// Every example in the w9y bbtex@v2.0.12 manifest, grouped by theme. Each
// id must match a `wasm` declaration in the plugin manifest (same dst
// bin/<id>). The optional `profile` merges over the terminal defaults
// before the task starts (pager needs its CWD on /preset where the
// artichoke.md preset lands).
export const BTEX_EXAMPLES = [
  // --- Forms & Input
  { id: "textinput", label: "Text Input", group: "Forms & Input", blurb: "Single-line input" },
  { id: "textinputs", label: "Text Inputs", group: "Forms & Input", blurb: "Multiple inputs + cursor modes" },
  { id: "textarea", label: "Textarea", group: "Forms & Input", blurb: "Multiline input" },
  { id: "dynamic-textarea", label: "Dynamic Textarea", group: "Forms & Input", blurb: "Auto-growing textarea" },
  { id: "split-editors", label: "Split Editors", group: "Forms & Input", blurb: "Multiple textareas, switchable focus" },
  { id: "autocomplete", label: "Autocomplete", group: "Forms & Input", blurb: "Input with suggestions" },
  { id: "isbn-form", label: "ISBN Form", group: "Forms & Input", blurb: "Multi-step validated form" },
  { id: "file-picker", label: "File Picker", group: "Forms & Input", blurb: "Browse the file system" },
  { id: "mouse", label: "Mouse", group: "Forms & Input", blurb: "Mouse event handling" },
  { id: "clickable", label: "Clickable", group: "Forms & Input", blurb: "Mouse-clickable dialogs" },
  { id: "print-key", label: "Print Key", group: "Forms & Input", blurb: "Echo typed keys" },
  { id: "keyboard-enhancements", label: "Keyboard Enhancements", group: "Forms & Input", blurb: "Enhanced keyboard events" },
  // --- Lists & Tables
  { id: "list-default", label: "List (Default)", group: "Lists & Tables", blurb: "The list bubble" },
  { id: "list-fancy", label: "List (Fancy)", group: "Lists & Tables", blurb: "Customized list bubble" },
  { id: "list-simple", label: "List (Simple)", group: "Lists & Tables", blurb: "Compact list bubble" },
  { id: "table", label: "Table", group: "Lists & Tables", blurb: "Tabular data" },
  { id: "table-resize", label: "Table Resize", group: "Lists & Tables", blurb: "Resizable table" },
  { id: "tabs", label: "Tabs", group: "Lists & Tables", blurb: "Tabbed navigation" },
  { id: "paginator", label: "Paginator", group: "Lists & Tables", blurb: "Paged list" },
  { id: "pager", label: "Pager", group: "Lists & Tables", blurb: "less-style pager", profile: { wd: "/preset" } },
  { id: "views", label: "Views", group: "Lists & Tables", blurb: "Multiple switchable views" },
  { id: "composable-views", label: "Composable Views", group: "Lists & Tables", blurb: "Compose spinner + timer models" },
  // --- Progress & Time
  { id: "spinner", label: "Spinner", group: "Progress & Time", blurb: "Loading spinner" },
  { id: "spinners", label: "Spinners", group: "Progress & Time", blurb: "All spinner types" },
  { id: "progress-bar", label: "Progress Bar", group: "Progress & Time", blurb: "Bar with controls" },
  { id: "progress-animated", label: "Progress (Animated)", group: "Progress & Time", blurb: "Animated progression" },
  { id: "progress-download", label: "Progress (Download)", group: "Progress & Time", blurb: "Download with progress" },
  { id: "progress-static", label: "Progress (Static)", group: "Progress & Time", blurb: "Incremental progress" },
  { id: "stopwatch", label: "Stopwatch", group: "Progress & Time", blurb: "Elapsed time" },
  { id: "timer", label: "Timer", group: "Progress & Time", blurb: "Countdown" },
  { id: "splash", label: "Splash", group: "Progress & Time", blurb: "Textual-style splash" },
  { id: "realtime", label: "Realtime", group: "Progress & Time", blurb: "Channels for live updates" },
  // --- Visuals & Effects
  { id: "glamour", label: "Glamour", group: "Visuals & Effects", blurb: "Markdown rendering" },
  { id: "doom-fire", label: "Doom Fire", group: "Visuals & Effects", blurb: "Flaming pixels" },
  { id: "eyes", label: "Eyes", group: "Visuals & Effects", blurb: "Eyes follow the cursor" },
  { id: "canvas", label: "Canvas", group: "Visuals & Effects", blurb: "Draw on a canvas" },
  { id: "cellbuffer", label: "Cell Buffer", group: "Visuals & Effects", blurb: "Animate on a cell grid" },
  { id: "space", label: "Space", group: "Visuals & Effects", blurb: "FPS starfield" },
  { id: "vanish", label: "Vanish", group: "Visuals & Effects", blurb: "Dissolve on quit" },
  { id: "altscreen-toggle", label: "Alt Screen Toggle", group: "Visuals & Effects", blurb: "Alternate vs normal buffer" },
  { id: "fullscreen", label: "Fullscreen", group: "Visuals & Effects", blurb: "Alt-screen countdown" },
  { id: "cursor-style", label: "Cursor Style", group: "Visuals & Effects", blurb: "Cursor shape switching" },
  { id: "colorprofile", label: "Color Profile", group: "Visuals & Effects", blurb: "Terminal color detection" },
  { id: "set-terminal-color", label: "Set Terminal Color", group: "Visuals & Effects", blurb: "Palette control" },
  { id: "set-window-title", label: "Set Window Title", group: "Visuals & Effects", blurb: "Title control" },
  // --- System & Events
  { id: "help", label: "Help", group: "System & Events", blurb: "Help bubble" },
  { id: "query-term", label: "Query Terminal", group: "System & Events", blurb: "ANSI capability queries" },
  { id: "capability", label: "Capability", group: "System & Events", blurb: "Terminal capability query" },
  { id: "focus-blur", label: "Focus / Blur", group: "System & Events", blurb: "Focus loss handling" },
  { id: "prevent-quit", label: "Prevent Quit", group: "System & Events", blurb: "Intercept quit events" },
  { id: "suspend", label: "Suspend", group: "System & Events", blurb: "Suspend & resume" },
  { id: "window-size", label: "Window Size", group: "System & Events", blurb: "Show window size" },
  // --- Commands & Messaging
  { id: "simple", label: "Simple", group: "Commands & Messaging", blurb: "Minimal app" },
  { id: "result", label: "Result", group: "Commands & Messaging", blurb: "Choice menu" },
  { id: "send-msg", label: "Send Msg", group: "Commands & Messaging", blurb: "Custom messages" },
  { id: "sequence", label: "Sequence", group: "Commands & Messaging", blurb: "Sequenced commands" },
  { id: "debounce", label: "Debounce", group: "Commands & Messaging", blurb: "Throttle key presses" },
  { id: "exec", label: "Exec", group: "Commands & Messaging", blurb: "Run a subprocess" },
  { id: "pipe", label: "Pipe", group: "Commands & Messaging", blurb: "Shell pipe I/O" },
  { id: "http", label: "HTTP", group: "Commands & Messaging", blurb: "Fetch a URL" },
  { id: "chat", label: "Chat", group: "Commands & Messaging", blurb: "Chat with textarea input" },
  { id: "package-manager", label: "Package Manager", group: "Commands & Messaging", blurb: "tea.Println UI" },
  { id: "tui-daemon-combo", label: "TUI Daemon", group: "Commands & Messaging", blurb: "TUI + daemon modes" },
];

// Sidebar group order (matches the grouping comments above).
export const BTEX_GROUPS = [
  "Forms & Input",
  "Lists & Tables",
  "Progress & Time",
  "Visuals & Effects",
  "System & Events",
  "Commands & Messaging",
];

// Default profile with cmd = example id, then per-example overrides.
function embedProfileFor(example) {
  return {
    ...getDefaultTerminalProfile(),
    cmd: example.id,
    ...(example.profile || {}),
  };
}

// One open example: a header (name + close) over an embed anchor. The
// terminal mounts when the anchor exists and is destroyed on unmount.
function ExampleTerminal({ example, onClose }) {
  const anchorRef = useRef(null);
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    let handle = null;
    try {
      handle = window.GearShell?.terminal?.embed(
        el,
        embedProfileFor(example),
      );
    } catch (error) {
      console.error("bbtex: terminal.embed failed", error);
    }
    return () => {
      try {
        handle?.detach?.();
      } catch {
        // session may already be gone with the panel
      }
    };
  }, [example.id]);
  return React.createElement(
    "div",
    { className: "bbtex-term" },
    React.createElement(
      "div",
      { className: "bbtex-term-head" },
      React.createElement("span", { className: "bbtex-term-name" }, example.label),
      React.createElement(
        "button",
        {
          type: "button",
          className: "bbtex-term-close",
          title: "Close terminal",
          onClick: onClose,
        },
        React.createElement(X, { size: 12, "aria-hidden": true }),
      ),
    ),
    React.createElement("div", { className: "bbtex-term-body", ref: anchorRef }),
  );
}

// The left sidebar: every example grouped by theme, with the open ones
// highlighted and a per-group count.
function ExampleList({ open, onToggle }) {
  const isOpen = (example) => open.some((item) => item.id === example.id);
  return React.createElement(
    "div",
    { className: "bbtex-sidebar" },
    React.createElement("h3", { className: "bbtex-title" }, "Examples"),
    React.createElement(
      "div",
      { className: "bbtex-examples" },
      BTEX_GROUPS.map((group) => {
        const items = BTEX_EXAMPLES.filter((example) =>
          example.group === group
        );
        if (items.length === 0) return null;
        return React.createElement(
          "div",
          { key: group, className: "bbtex-group" },
          React.createElement(
            "div",
            { className: "bbtex-group-head" },
            React.createElement("span", null, group),
            React.createElement("span", { className: "bbtex-group-count" }, items.length),
          ),
          items.map((example) =>
            React.createElement(
              "button",
              {
                key: example.id,
                type: "button",
                className:
                  "bbtex-example" + (isOpen(example) ? " is-open" : ""),
                onClick: () => onToggle(example),
              },
              React.createElement(
                "span",
                { className: "bbtex-example-name" },
                example.label,
              ),
              React.createElement(
                "span",
                { className: "bbtex-example-blurb" },
                example.blurb,
              ),
            )
          ),
        );
      })
    ),
  );
}

// The right stage: one embedded terminal per open example, or a hint.
function PlaygroundStage({ open, onClose }) {
  if (open.length === 0) {
    return React.createElement(
      "div",
      { className: "bbtex-stage" },
      React.createElement(
        "div",
        { className: "bbtex-empty" },
        "Pick an example to run it in a live terminal",
      ),
    );
  }
  return React.createElement(
    "div",
    { className: "bbtex-stage" },
    open.map((example) =>
      React.createElement(ExampleTerminal, {
        key: example.id,
        example,
        onClose: () => onClose(example),
      })
    ),
  );
}

export function BbtexPlayground() {
  const [open, setOpen] = useState([]);
  const toggle = (example) => {
    setOpen((prev) =>
      prev.some((item) => item.id === example.id)
        ? prev.filter((item) => item.id !== example.id)
        : [...prev, example]
    );
  };
  return React.createElement(
    "div",
    { className: "bbtex-playground" },
    React.createElement(ExampleList, { open, onToggle: toggle }),
    React.createElement(PlaygroundStage, { open, onClose: toggle }),
  );
}
