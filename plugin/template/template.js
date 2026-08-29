// template.js — the Plugin Template panel.
//
// A working example of everything a panel plugin can do through the
// permission-scoped window.GearShell API:
//   config.getShell   — read the shell config (the manifest lives here)
//   tasks.create      — run a headless task and capture its output
//   events.on/off     — subscribe to shell events (task.status, ...)
//   w9y.list/status   — query the w9y install registry
//   terminal.embed    — mount a live terminal into the panel
//   panels.open       — open other panels
// Read the comments; each demo maps to a line in the manifest's
// permissions array.

import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Play, RefreshCw, TerminalSquare } from "lucide-react";

const EVENT_TOPICS = ["task.status", "w9y.changed"];

function useTemplateState() {
  const [manifest, setManifest] = useState(null);
  const [events, setEvents] = useState([]);
  const eventIdRef = useRef(0);
  useEffect(() => {
    try {
      const plugins = window.GearShell?.config?.getShell?.()?.plugins || [];
      setManifest(plugins.find((plugin) => plugin.id === "template") || null);
    } catch {
      // plugin disabled or API not ready — the panel only mounts when
      // the plugin is enabled, so this is just a safety net
    }
    // Event subscription demo: keep the last few task.status /
    // w9y.changed events on screen. events.on returns an unsubscribe.
    const unsubscribe = window.GearShell?.events?.on?.(
      "task.status",
      (payload) => {
        eventIdRef.current += 1;
        setEvents((prev) =>
          [...prev, { id: eventIdRef.current, topic: "task.status", payload }]
            .slice(-4),
        );
      },
    );
    const unsubscribeW9y = window.GearShell?.events?.on?.(
      "w9y.changed",
      (payload) => {
        eventIdRef.current += 1;
        setEvents((prev) =>
          [...prev, { id: eventIdRef.current, topic: "w9y.changed", payload }]
            .slice(-4),
        );
      },
    );
    return () => {
      unsubscribe?.();
      unsubscribeW9y?.();
    };
  }, []);
  return { manifest, events, setEvents };
}

function TemplateHeader({ manifest }) {
  return React.createElement(
    "div",
    { className: "template-header" },
    React.createElement(BookOpen, { size: 18, "aria-hidden": true }),
    React.createElement(
      "div",
      { className: "template-header-text" },
      React.createElement("h2", null, "Plugin Template"),
      React.createElement(
        "p",
        null,
        "A reference plugin: panel + settings section + overlay, and the permission-scoped API. Disabled by default in the Plugins page.",
      ),
    ),
    manifest
      ? React.createElement(
          "pre",
          { className: "template-manifest" },
          JSON.stringify(
            {
              id: manifest.id,
              version: manifest.version,
              entry: manifest.entry,
              permissions: manifest.permissions,
            },
            null,
            1,
          ),
        )
      : null,
  );
}

// --- Demo 1: headless tasks (tasks.create + events) ---
function TaskDemo({ onNotice }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const run = async () => {
    setRunning(true);
    onNotice("tasks.create: started a headless task; its exit + log arrive via task.status / task.output.");
    const created = window.GearShell?.tasks?.create?.({
      cmd: "echo hello from the template task; w9y mod list-installed --prefix /opfs/wanix 2>&1",
      background: true,
    });
    if (!created?.ok) {
      onNotice("tasks.create failed: " + (created?.error || "unknown"));
      setRunning(false);
      return;
    }
    const id = created.taskId;
    const deadline = Date.now() + 60000;
    const poll = async () => {
      const task = window.GearShell?.tasks?.list?.()?.find?.((item) => item.id === id);
      if (task && (task.status === "succeeded" || task.status === "failed")) {
        const out = window.GearShell?.tasks?.output?.(id);
        setOutput(out?.ok ? out.output || "(no output)" : out?.error || "(no output)");
        onNotice(`task ${id} finished: ${task.status}${task.error ? " (" + task.error + ")" : ""}`);
        setRunning(false);
        return;
      }
      if (Date.now() < deadline) setTimeout(poll, 800);
      else {
        onNotice("task timed out (headless output needs the log path)");
        setRunning(false);
      }
    };
    setTimeout(poll, 1500);
  };
  return React.createElement(
    "div",
    { className: "template-demo" },
    React.createElement(
      "h3",
      null,
      React.createElement(Play, { size: 13, "aria-hidden": true }),
      "1. Headless task (tasks.create)",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "template-btn",
        disabled: running,
        onClick: run,
      },
      running ? "Running…" : "Run a headless task",
    ),
    output
      ? React.createElement("pre", { className: "template-output" }, output)
      : null,
  );
}

// --- Demo 2: the w9y registry (w9y.list/status) ---
function W9yDemo({ onNotice }) {
  const [packages, setPackages] = useState(null);
  const refresh = () => {
    const result = window.GearShell?.w9y?.list?.();
    if (!result?.ok) {
      onNotice("w9y.list failed: " + (result?.error || "unknown"));
      return;
    }
    setPackages(result.packages || []);
  };
  return React.createElement(
    "div",
    { className: "template-demo" },
    React.createElement(
      "h3",
      null,
      React.createElement(RefreshCw, { size: 13, "aria-hidden": true }),
      "2. w9y registry (w9y.list)",
    ),
    React.createElement(
      "button",
      { type: "button", className: "template-btn", onClick: refresh },
      "List installed packages",
    ),
    packages
      ? React.createElement(
          "ul",
          { className: "template-list" },
          packages.map((pkg) =>
            React.createElement(
              "li",
              { key: pkg.id },
              `${pkg.id} @ ${pkg.version || "latest"} — ${pkg.entryCount} entries`,
            )
          ),
        )
      : null,
  );
}

// --- Demo 3: a live embedded terminal (terminal.embed) ---
function EmbedDemo({ onNotice }) {
  const anchorRef = useRef(null);
  const detachRef = useRef(null);
  const mount = () => {
    const anchor = anchorRef.current;
    if (!anchor || detachRef.current) return;
    try {
      const handle = window.GearShell?.terminal?.embed?.(anchor, {
        cmd: "echo embedded from the template plugin; w9y mod list-installed --prefix /opfs/wanix",
        wd: "/",
      });
      detachRef.current = handle?.detach || null;
      onNotice("terminal.embed: a task terminal mounted into the panel.");
    } catch (error) {
      onNotice("terminal.embed failed: " + (error?.message || error));
    }
  };
  const close = () => {
    detachRef.current?.();
    detachRef.current = null;
  };
  useEffect(() => close, []);
  return React.createElement(
    "div",
    { className: "template-demo" },
    React.createElement(
      "h3",
      null,
      React.createElement(TerminalSquare, { size: 13, "aria-hidden": true }),
      "3. Embedded terminal (terminal.embed)",
    ),
    React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        { type: "button", className: "template-btn", onClick: mount },
        "Embed a terminal",
      ),
      React.createElement(
        "button",
        { type: "button", className: "template-btn", onClick: close },
        "Close it",
      ),
    ),
    React.createElement("div", { className: "template-embed", ref: anchorRef }),
  );
}

// --- Demo 4: live event feed (events.on/off) ---
function EventFeed({ events }) {
  return React.createElement(
    "div",
    { className: "template-demo" },
    React.createElement(
      "h3",
      null,
      "4. Event feed (events.on) — topics: " + EVENT_TOPICS.join(", "),
    ),
    React.createElement(
      "ul",
      { className: "template-list template-events" },
      events.length === 0
        ? React.createElement("li", null, "No events yet — run demo 1 or check w9y.")
        : events.map((event) =>
          React.createElement(
            "li",
            { key: event.id },
            `[${event.topic}] `,
            JSON.stringify(event.payload).slice(0, 120),
          )
        ),
    ),
  );
}

export function TemplatePanel() {
  const state = useTemplateState();
  const [notice, setNotice] = useState(null);
  const flash = (text) => setNotice(text);
  return React.createElement(
    "div",
    { className: "template-panel" },
    React.createElement(TemplateHeader, { manifest: state.manifest }),
    notice
      ? React.createElement(
          "div",
          { className: "template-notice", onClick: () => setNotice(null) },
          notice,
        )
      : null,
    React.createElement(TaskDemo, { onNotice: flash }),
    React.createElement(W9yDemo, { onNotice: flash }),
    React.createElement(EmbedDemo, { onNotice: flash }),
    React.createElement(EventFeed, { events: state.events }),
  );
}
