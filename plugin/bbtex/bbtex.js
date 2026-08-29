// bbtex.js — Bubble Tea playground panel.
//
// Left: a curated list of bbtex examples. Right: one embedded terminal
// per open example (terminal.embed with profile.cmd = example id, so the
// terminal task runs the example binary as its command). The examples are
// declared as wasm deps in the plugin manifest and mounted at bin/<id> in
// every task namespace; each terminal's task is the wanix-side worker
// that execs it. q quits a Bubble Tea program; the close button detaches
// and destroys the session.

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getDefaultTerminalProfile } from "../../app-terminal-profiles.js?v=20260826.102";

// Curated bbtex@v2.0.12 examples. Each id must match a `wasm` declaration
// in the plugin manifest (same dst bin/<id>).
export const BTEX_EXAMPLES = [
  { id: "spinner", label: "Spinner", blurb: "Animated spinner" },
  { id: "list-fancy", label: "List (Fancy)", blurb: "Filterable list" },
  { id: "table", label: "Table", blurb: "Sortable table" },
  { id: "textinput", label: "Text Input", blurb: "Input field" },
  { id: "progress-bar", label: "Progress Bar", blurb: "Animated progress" },
  { id: "stopwatch", label: "Stopwatch", blurb: "Elapsed time" },
  { id: "timer", label: "Timer", blurb: "Countdown" },
  { id: "tabs", label: "Tabs", blurb: "Tab navigation" },
  { id: "paginator", label: "Paginator", blurb: "Paged content" },
  { id: "eyes", label: "Eyes", blurb: "Follows the cursor" },
  { id: "doom-fire", label: "Doom Fire", blurb: "Flaming pixels" },
  { id: "glamour", label: "Glamour", blurb: "Markdown render" },
];

function embedProfileFor(exampleId) {
  return { ...getDefaultTerminalProfile(), cmd: exampleId };
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
        embedProfileFor(example.id),
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

export function BbtexPlayground() {
  const [open, setOpen] = useState([]);
  const toggle = (example) => {
    setOpen((prev) =>
      prev.some((item) => item.id === example.id)
        ? prev.filter((item) => item.id !== example.id)
        : [...prev, example]
    );
  };
  const isOpen = (id) => open.some((item) => item.id === id);
  return React.createElement(
    "div",
    { className: "bbtex-playground" },
    React.createElement(
      "div",
      { className: "bbtex-sidebar" },
      React.createElement("h3", { className: "bbtex-title" }, "Examples"),
      React.createElement(
        "div",
        { className: "bbtex-examples" },
        BTEX_EXAMPLES.map((example) =>
          React.createElement(
            "button",
            {
              key: example.id,
              type: "button",
              className:
                "bbtex-example" + (isOpen(example.id) ? " is-open" : ""),
              onClick: () => toggle(example),
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
      ),
    ),
    React.createElement(
      "div",
      { className: "bbtex-stage" },
      open.length === 0
        ? React.createElement(
            "div",
            { className: "bbtex-empty" },
            "Pick an example to run it in a live terminal",
          )
        : open.map((example) =>
            React.createElement(ExampleTerminal, {
              key: example.id,
              example,
              onClose: () => toggle(example),
            })
          ),
    ),
  );
}
