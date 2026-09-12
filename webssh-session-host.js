import { kvGet, kvSet } from "./plugin/crush-playground/kv-api.js";
import {
  exitExternalTerminal,
  onExternalTerminalInput,
  onExternalTerminalResize,
  promptExternalTerminal,
  waitForExternalTerminalSize,
  pushExternalTerminalEvent,
  setExternalTerminalDispose,
  setExternalTerminalReconnect,
  writeExternalTerminal,
} from "./external-terminal-sessions.js";

const WORKER_URL = new URL("./plugin/webssh/session-worker.js", import.meta.url);
const KNOWN_HOSTS_KEY = "webssh:known-host-key-fingerprints";

function knownHostKeys() {
  const stored = kvGet(KNOWN_HOSTS_KEY);
  return Array.isArray(stored) ? stored : [];
}

function trustHostKey(fingerprint) {
  const next = new Set(knownHostKeys());
  next.add(fingerprint);
  kvSet(KNOWN_HOSTS_KEY, [...next]);
}

function relayPrompt(worker, sessionId, message) {
  promptExternalTerminal(sessionId, message.prompt)
    .then((value) => worker.postMessage({ type: "response", id: message.id, value }))
    .catch(() => worker.postMessage({ type: "response", id: message.id, value: null }));
}

export async function startWebSshSession(sessionId, config) {
  const size = await waitForExternalTerminalSize(sessionId);
  const worker = new Worker(WORKER_URL);
  const offInput = onExternalTerminalInput(sessionId, (data) => {
    const input = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
    worker.postMessage({ type: "input", data: input });
  });
  const offResize = onExternalTerminalResize(sessionId, (payload) => {
    worker.postMessage({ type: "resize", payload: { ...payload, type: "resize" } });
  });
  const dispose = () => {
    offInput();
    offResize();
    worker.postMessage({ type: "close" });
    worker.terminate();
  };
  setExternalTerminalDispose(sessionId, dispose);
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "output") writeExternalTerminal(sessionId, message.data);
    if (message?.type === "prompt") relayPrompt(worker, sessionId, message);
    if (message?.type === "hostKey" && message.trusted) trustHostKey(message.fingerprint);
    if (message?.type === "exit") {
      const reason = message.payload?.error || "Connection closed.";
      writeExternalTerminal(sessionId, `\r\n\x1b[33m${reason}\x1b[0m\r\nPress any key to reconnect...\r\n`);
      setExternalTerminalReconnect(sessionId, () => {
        dispose();
        startWebSshSession(sessionId, config).catch(() => {});
      });
      exitExternalTerminal(sessionId, message.payload);
    }
  });
  worker.postMessage({
    type: "start",
    config: { ...config, trustedHostKeys: knownHostKeys(), ...size },
  });
}
