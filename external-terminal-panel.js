import React, { useEffect, useRef } from "react";
import htm from "htm";
import { mountTerminal } from "./plugin/terminal-mount.mjs";
import {
  disposeExternalTerminal,
  onExternalTerminalExit,
  onExternalTerminalOutput,
  resizeExternalTerminal,
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
  useEffect(() => {
    if (!anchor.current) return;
    let handle;
    mountTerminal(anchor.current, externalSession(params.sessionId), {
      terminal: { fontSize: 14, theme: { background: "#0b1120" } },
      exitMessage: false,
      onExit: () => { anchor.current.textContent = "Connection closed."; },
    }).then((mounted) => { handle = mounted; }).catch(() => {});
    return () => handle?.dispose();
  }, [params.sessionId]);
  return html`<div ref=${anchor} className="panel-content"></div>`;
}
