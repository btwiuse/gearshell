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
//
// Rendering uses htm (importmap): htm.bind(React.createElement) yields a
// JSX-like template tag with zero build step. Plugins only import bare
// specifiers listed in index.html's importmap — that is how every plugin
// shares the shell's single React instance.

import React, { useEffect, useRef, useState } from "react";
import htm from "htm";
import { BookOpen, Play, RefreshCw, TerminalSquare } from "lucide-react";

const html = htm.bind(React.createElement);

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
  const manifestJson = manifest
    ? JSON.stringify(
        {
          id: manifest.id,
          version: manifest.version,
          entry: manifest.entry,
          permissions: manifest.permissions,
        },
        null,
        1,
      )
    : null;
  return html`
    <div className="template-header">
      <${BookOpen} size=${18} aria-hidden=${true}/>
      <div className="template-header-text">
        <h2>Plugin Template</h2>
        <p>A reference plugin: panel + settings section + overlay, and the permission-scoped API. Disabled by default in the Plugins page.</p>
      </div>
      ${manifest ? html`<pre className="template-manifest">${manifestJson}</pre>` : null}
    </div>
  `;
}

// --- Demo 1: headless tasks (tasks.create + events) ---
// term: false is required for headless capture — tasks default to an
// interactive terminal (normalizeTask: term: task.term !== false). The
// result renders the captured stdout/stderr as a log plus a JSON
// metadata block (exit code, duration) — console.log never shows it.
function TaskDemo({ onNotice }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const run = () => {
    setRunning(true);
    setResult(null);
    onNotice("tasks.create: headless task started — output lands as a log below, metadata as JSON.");
    // term: false makes it headless-capturable; background lives in the
    // OPTIONS (2nd arg), not the spec — inside the spec it is ignored
    // and the task would become a real panel task with a definition id
    // that never matches the numeric session list.
    const created = window.GearShell?.tasks?.create?.(
      {
        cmd: "echo hello from the template task; w9y mod list-installed --prefix /opfs/wanix 2>&1",
        term: false,
      },
      { background: true },
    );
    if (!created?.ok) {
      onNotice("tasks.create failed: " + (created?.error || "unknown"));
      setRunning(false);
      return;
    }
    const id = created.taskId;
    const startedAt = Date.now();
    const deadline = startedAt + 60000;
    const poll = () => {
      const task = window.GearShell?.tasks?.list?.()?.find?.(
        (item) => item.id === id,
      );
      if (task && (task.status === "succeeded" || task.status === "failed")) {
        const out = window.GearShell?.tasks?.output?.(id);
        setResult({
          cmd: task.cmd,
          status: task.status,
          error: task.error || null,
          exitCode: task.status === "succeeded" ? 0 : parseExitCode(task.error),
          durationMs: Date.now() - startedAt,
          output: out?.ok ? out.output || "" : out?.error || "(unavailable)",
        });
        onNotice(
          `task ${id} finished: ${task.status}${task.error ? " (" + task.error + ")" : ""}`,
        );
        setRunning(false);
        return;
      }
      if (Date.now() < deadline) setTimeout(poll, 800);
      else {
        setResult({
          cmd: "…",
          status: "timeout",
          error: "exceeded 60s",
          exitCode: null,
          durationMs: 60000,
          output: "",
        });
        setRunning(false);
      }
    };
    setTimeout(poll, 1500);
  };
  return html`
    <div className="template-demo">
      <h3><${Play} size=${13} aria-hidden=${true}/>1. Headless task (tasks.create)</h3>
      <button type="button" className="template-btn" disabled=${running} onClick=${run}>${running ? "Running…" : "Run a headless task"}</button>
      ${result ? html`<${TaskResult} result=${result}/>` : null}
    </div>
  `;
}

// Parse "exit 3" from a task error into the numeric exit code.
function parseExitCode(error) {
  const match = /exit (\d+)/.exec(String(error || ""));
  return match ? Number(match[1]) : null;
}

// The headless task result: the captured stdout/stderr rendered as a
// log, followed by a JSON metadata block (cmd, exit code, duration).
function TaskResult({ result }) {
  const meta = {
    status: result.status,
    exitCode: result.exitCode,
    error: result.error,
    durationMs: result.durationMs,
    duration: (result.durationMs / 1000).toFixed(2) + "s",
    outputBytes: String(result.output || "").length,
  };
  return html`
    <div className="template-task-result">
      <div className="template-log-head">stdout/stderr (captured via the task log, not console)</div>
      <pre className="template-output">${result.output || "(no output)"}</pre>
      <pre className="template-json">${JSON.stringify(meta, null, 2)}</pre>
    </div>
  `;
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
  return html`
    <div className="template-demo">
      <h3><${RefreshCw} size=${13} aria-hidden=${true}/>2. w9y registry (w9y.list)</h3>
      <button type="button" className="template-btn" onClick=${refresh}>List installed packages</button>
      ${packages
        ? html`
            <ul className="template-list">
              ${packages.map((pkg) =>
                html`<li key=${pkg.id}>${pkg.id} @ ${pkg.version || "latest"} — ${pkg.entryCount} entries</li>`,
              )}
            </ul>
          `
        : null}
    </div>
  `;
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
  return html`
    <div className="template-demo">
      <h3><${TerminalSquare} size=${13} aria-hidden=${true}/>3. Embedded terminal (terminal.embed)</h3>
      <div>
        <button type="button" className="template-btn" onClick=${mount}>Embed a terminal</button>
        <button type="button" className="template-btn" onClick=${close}>Close it</button>
      </div>
      <div className="template-embed" ref=${anchorRef}></div>
    </div>
  `;
}

// --- Demo 4: live event feed (events.on/off) ---
function EventFeed({ events }) {
  return html`
    <div className="template-demo">
      <h3>4. Event feed (events.on) — topics: ${EVENT_TOPICS.join(", ")}</h3>
      <ul className="template-list template-events">
        ${events.length === 0
          ? html`<li>No events yet — run demo 1 or check w9y.</li>`
          : events.map((event) =>
              html`<li key=${event.id}>[${event.topic}] ${JSON.stringify(event.payload).slice(0, 120)}</li>`,
            )}
      </ul>
    </div>
  `;
}

export function TemplatePanel() {
  const state = useTemplateState();
  const [notice, setNotice] = useState(null);
  const flash = (text) => setNotice(text);
  return html`
    <div className="template-panel">
      <${TemplateHeader} manifest=${state.manifest}/>
      ${notice
        ? html`<div className="template-notice" onClick=${() => setNotice(null)}>${notice}</div>`
        : null}
      <${TaskDemo} onNotice=${flash}/>
      <${W9yDemo} onNotice=${flash}/>
      <${EmbedDemo} onNotice=${flash}/>
      <${EventFeed} events=${state.events}/>
    </div>
  `;
}
