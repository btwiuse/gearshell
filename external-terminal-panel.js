import React, { useEffect, useRef, useState } from "react";
import htm from "htm";
import { mountTerminal } from "./plugin/terminal-mount.mjs";
import {
  disposeExternalTerminal,
  onExternalTerminalExit,
  onExternalTerminalOutput,
  onExternalTerminalPrompt,
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
  const [prompt, setPrompt] = useState(null);
  useEffect(() => onExternalTerminalPrompt(params.sessionId, setPrompt), [params.sessionId]);
  useEffect(() => {
    if (!anchor.current) return;
    let handle;
    mountTerminal(anchor.current, externalSession(params.sessionId), {
      terminal: { fontSize: 14, theme: { background: "#0b1120" } },
      exitMessage: false,
      onExit: (payload) => { anchor.current.textContent = payload?.error || "Connection closed."; },
    }).then((mounted) => { handle = mounted; }).catch(() => {});
    return () => handle?.dispose();
  }, [params.sessionId]);
  const respond = (value) => {
    respondExternalTerminalPrompt(params.sessionId, value);
    setPrompt(null);
  };
  return html`
    <div className="panel-content" style=${{ position: "relative" }}>
      <div ref=${anchor} style=${{ width: "100%", height: "100%" }}></div>
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
