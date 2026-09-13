import React, { useEffect, useRef, useState } from "react";
import htm from "htm";
import { getDockviewApi } from "./app-panels-store.js";
import { ghosttyIdentity, mountTerminal } from "./plugin/terminal-mount.mjs";
import {
  disposeExternalTerminal,
  onExternalTerminalExit,
  onExternalTerminalOutput,
  onExternalTerminalPrompt,
  onExternalTerminalNotification,
  resizeExternalTerminal,
  respondExternalTerminalPrompt,
  sendExternalTerminalInput,
} from "./external-terminal-sessions.js";

const html = htm.bind(React.createElement);

function externalSession(sessionId) {
  return {
    create: () => ({ sessionId }),
    write: (id, data) => sendExternalTerminalInput(id, data),
    resize: (id, cols, rows, xpixel, ypixel) =>
      resizeExternalTerminal(id, cols, rows, xpixel, ypixel),
    dispose: (id) => disposeExternalTerminal(id),
    onOutput: onExternalTerminalOutput,
    onExit: onExternalTerminalExit,
  };
}

function renderProgress(bar, progress) {
  const state = progress?.state;
  bar.hidden = state === 0 || state == null;
  bar.dataset.state = String(state == null ? 0 : state);
  bar.firstElementChild.style.width = `${Math.max(0, Math.min(100, Number(progress?.value) || 0))}%`;
}

function wireProgress(term, libs, bar) {
  const addon = new libs.ProgressAddon();
  term.loadAddon(addon);
  addon.onChange((progress) => renderProgress(bar, progress));
  let carry = "";
  return (data) => {
    const text = carry + (typeof data === "string" ? data : new TextDecoder().decode(data));
    const matches = [...text.matchAll(/\x1b\]9;4;(\d+)(?:;(\d+))?(?:\x07|\x1b\\)/g)];
    const latest = matches.at(-1);
    if (latest) renderProgress(bar, { state: Number(latest[1]), value: Number(latest[2]) || 0 });
    carry = text.slice(text.lastIndexOf("\x1b"));
  };
}

export function ExternalTerminalPanel({ params }) {
  const anchor = useRef(null);
  const progress = useRef(null);
  const terminal = useRef(null);
  const [prompt, setPrompt] = useState(null);
  const [notification, setNotification] = useState(null);
  useEffect(() => onExternalTerminalPrompt(params.sessionId, setPrompt), [params.sessionId]);
  useEffect(() => onExternalTerminalNotification(params.sessionId, (next) => {
    setNotification(next);
    if (next?.timeoutMs) setTimeout(() => setNotification(null), next.timeoutMs);
  }), [params.sessionId]);
  useEffect(() => {
    if (!anchor.current) return;
    let handle;
    let offActive;
    let observeProgress = () => {};
    mountTerminal(anchor.current, externalSession(params.sessionId), {
      ...ghosttyIdentity({ terminal: { fontSize: 14, theme: { background: "#0b1120" } } }),
      exitMessage: false,
      setupAddons: (term, libs) => { observeProgress = wireProgress(term, libs, progress.current); },
      onData: (data) => observeProgress(data),
    }).then((mounted) => {
      handle = mounted;
      terminal.current = mounted.term;
      const activate = () => {
        mounted.fitTerminal();
        requestAnimationFrame(() => mounted.term.focus());
      };
      offActive = getDockviewApi()?.onDidActivePanelChange((event) => {
        if (event.panel?.params?.sessionId === params.sessionId) activate();
      });
      activate();
    }).catch(() => {});
    return () => {
      terminal.current = null;
      offActive?.dispose?.();
      handle?.dispose();
    };
  }, [params.sessionId]);
  const respond = (value) => {
    respondExternalTerminalPrompt(params.sessionId, value);
    setPrompt(null);
    requestAnimationFrame(() => terminal.current?.focus());
  };
  return html`
    <div className="panel-content" style=${{ position: "relative" }}>
      <style>${"@keyframes external-term-progress-indeterminate { from { transform: translateX(-120%); } to { transform: translateX(320%); } } .external-term-progress[data-state=\"3\"] .external-term-progress-fill { width: 32% !important; background: linear-gradient(90deg, transparent, #f59e0b, transparent) !important; animation: external-term-progress-indeterminate 1.2s ease-in-out infinite; }"}</style>
      <div ref=${progress} className="external-term-progress" hidden style=${{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 3, height: "3px", background: "#334155", overflow: "hidden" }}><div className="external-term-progress-fill" style=${{ width: "0%", height: "100%", background: "#f59e0b", transition: "width 120ms linear" }}></div></div>
      <div ref=${anchor} style=${{ width: "100%", height: "100%" }}></div>
      ${notification && html`
        <div style=${{
          position: "absolute", right: "20px", bottom: "20px", zIndex: 3, maxWidth: "420px",
          padding: "12px 16px", border: "1px solid #854d0e", borderRadius: "8px",
          color: "#fde68a", background: "#1c1917", boxShadow: "0 12px 32px #0009",
        }}>${notification.message}</div>
      `}
      ${prompt && html`
        <form style=${{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 2, minWidth: "320px", padding: "20px", border: "1px solid #475569",
          borderRadius: "10px", color: "#e2e8f0", background: "#111827", boxShadow: "0 16px 48px #000a",
        }} onSubmit=${(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          respond(prompt.input === false ? "" : prompt.saveable
            ? { value: form.get("value"), save: form.has("save") }
            : form.get("value"));
        }}>
          <strong>${prompt.title || "SSH confirmation"}</strong>
          <pre>${prompt.message || ""}</pre>
          ${prompt.input !== false && html`<input name="value" type=${prompt.secret ? "password" : "text"} autoFocus style=${{ display: "block", width: "100%", margin: "12px 0", padding: "8px" }} />`}
          ${prompt.saveable && html`<label style=${{ display: "block", margin: "12px 0" }}><input name="save" type="checkbox" /> Save password</label>`}
          <div style=${{ display: "flex", justifyContent: "flex-end", gap: "8px" }}><button type="button" onClick=${() => respond(null)}>Cancel</button><button type="submit">${prompt.confirmLabel || "Continue"}</button></div>
        </form>
      `}
    </div>
  `;
}
