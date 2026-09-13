import React, { useEffect, useRef, useState } from "react";
import htm from "htm";
import { getDockviewApi } from "./app-panels-store.js";
import { mountTerminal } from "./plugin/terminal-mount.mjs";
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

export function ExternalTerminalPanel({ params }) {
  const anchor = useRef(null);
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
    mountTerminal(anchor.current, externalSession(params.sessionId), {
      terminal: { fontSize: 14, theme: { background: "#0b1120" } },
      exitMessage: false,
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
