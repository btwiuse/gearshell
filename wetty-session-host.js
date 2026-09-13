import { registerExternalTerminalAction } from "./external-terminal-actions.js";
import { registerExternalTerminalRecovery } from "./external-terminal-recovery.js";
import {
  exitExternalTerminal,
  notifyExternalTerminal,
  onExternalTerminalInput,
  onExternalTerminalResize,
  setExternalTerminalDispose,
  setExternalTerminalReconnect,
  waitForExternalTerminalSize,
  writeExternalTerminal,
} from "./external-terminal-sessions.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function send(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(encoder.encode(`${JSON.stringify(payload)}\n`));
}

function normalizeUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("WeTTY requires a ws:// or wss:// URL");
  }
  return url.href;
}

function initialFrame(config, size) {
  const frame = {
    version: 2,
    width: size.cols,
    height: size.rows,
  };
  if (Array.isArray(config.command) && config.command.length) frame.command = config.command;
  if (config.environment && typeof config.environment === "object") frame.env = config.environment;
  return frame;
}

function writeWettyOutput(sessionId, data) {
  try {
    const frame = JSON.parse(decoder.decode(data));
    if (typeof frame?.[2] === "string") writeExternalTerminal(sessionId, frame[2]);
  } catch {
    notifyExternalTerminal(sessionId, { message: "WeTTY sent an invalid terminal frame." });
  }
}

function reconnectWetty(sessionId, config) {
  writeExternalTerminal(sessionId, "\x1b[2J\x1b[H");
  notifyExternalTerminal(sessionId, { message: "Reconnecting…", timeoutMs: 5000 });
  startWettySession(sessionId, config).catch(() => {});
}

function handleClose(sessionId, config, event) {
  const reason = event.reason || `WeTTY connection closed (${event.code || "unknown"}).`;
  notifyExternalTerminal(sessionId, { message: reason });
  writeExternalTerminal(sessionId, "\r\n\x1b[90mPress any key to reconnect.\x1b[0m\r\n");
  setExternalTerminalReconnect(sessionId, () => reconnectWetty(sessionId, config));
  exitExternalTerminal(sessionId, { code: event.code, error: reason });
}

export async function startWettySession(sessionId, config) {
  const size = await waitForExternalTerminalSize(sessionId);
  const url = normalizeUrl(config.url);
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  const offInput = onExternalTerminalInput(sessionId, (data) => {
    const text = data instanceof Uint8Array ? decoder.decode(data) : String(data);
    for (let offset = 0; offset < text.length; offset += 4000) send(socket, [0, "i", text.slice(offset, offset + 4000)]);
  });
  const offResize = onExternalTerminalResize(sessionId, (next) => {
    send(socket, { version: 2, width: next.cols, height: next.rows });
  });
  let closedByOwner = false;
  const cleanup = () => {
    offInput();
    offResize();
  };
  setExternalTerminalDispose(sessionId, () => {
    closedByOwner = true;
    cleanup();
    socket.close();
  });
  socket.addEventListener("open", () => send(socket, initialFrame(config, size)));
  socket.addEventListener("message", (event) => writeWettyOutput(sessionId, event.data));
  socket.addEventListener("close", (event) => {
    cleanup();
    if (!closedByOwner) handleClose(sessionId, config, event);
  });
  socket.addEventListener("error", () => notifyExternalTerminal(sessionId, { message: "WeTTY WebSocket connection failed." }));
}

function wettyRecovery(config) {
  return { kind: "wetty", connection: { ...config, url: normalizeUrl(config.url) } };
}

function restoreWettySession({ sessionId, recovery }) {
  startWettySession(sessionId, recovery.connection).catch((error) => {
    notifyExternalTerminal(sessionId, { message: error?.message || String(error) });
  });
}

registerExternalTerminalRecovery("wetty", restoreWettySession);
registerExternalTerminalAction("startWetty", { recovery: wettyRecovery, start: startWettySession });
