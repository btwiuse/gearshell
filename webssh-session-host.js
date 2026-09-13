import { registerExternalTerminalAction } from "./external-terminal-actions.js";
import { registerExternalTerminalRecovery } from "./external-terminal-recovery.js";
import { kvGet, kvSet } from "./plugin/crush-playground/kv-api.js";
import {
  exitExternalTerminal,
  onExternalTerminalInput,
  onExternalTerminalResize,
  notifyExternalTerminal,
  promptExternalTerminal,
  waitForExternalTerminalSize,
  setExternalTerminalDispose,
  setExternalTerminalReconnect,
  writeExternalTerminal,
} from "./external-terminal-sessions.js";

const WORKER_URL = new URL("./plugin/webssh/session-worker.js", import.meta.url);
const KEYS_STORAGE_KEY = "webssh:keys:v1";
const KNOWN_HOSTS_KEY = "webssh:known-host-key-fingerprints";
const PASSWORDS_KEY = "webssh:saved-passwords:v1";

function knownHostKeys() {
  const stored = kvGet(KNOWN_HOSTS_KEY);
  return Array.isArray(stored) ? stored : [];
}

function trustHostKey(fingerprint) {
  const next = new Set(knownHostKeys());
  next.add(fingerprint);
  kvSet(KNOWN_HOSTS_KEY, [...next]);
}

function restoreAuthKeySets(fingerprints) {
  const stored = kvGet(KEYS_STORAGE_KEY);
  const wanted = new Set(Array.isArray(fingerprints) ? fingerprints : []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((key) => key?.enabled !== false && wanted.has(key?.sha256Fingerprint))
    .map(({ publicKey, privateKey, encrypted }) => ({ publicKey, privateKey, encrypted }));
}

function passwordKey(config) {
  try {
    const endpoint = new URL(config.pipingServerUrl);
    return JSON.stringify({ host: endpoint.searchParams.get("hostname") || "", port: endpoint.searchParams.get("port") || "22", username: config.username || "" });
  } catch {
    return "";
  }
}

function savedPassword(config) {
  const passwords = kvGet(PASSWORDS_KEY);
  return passwords?.[passwordKey(config)] || null;
}

function savePassword(config, password) {
  const key = passwordKey(config);
  if (!key || typeof password !== "string") return;
  kvSet(PASSWORDS_KEY, { ...(kvGet(PASSWORDS_KEY) || {}), [key]: password });
}

function relayPrompt(worker, sessionId, message, config) {
  if (message.prompt?.kind === "password") {
    const password = savedPassword(config);
    if (password !== null) {
      worker.postMessage({ type: "response", id: message.id, value: password });
      return;
    }
  }
  promptExternalTerminal(sessionId, message.prompt)
    .then((value) => {
      if (message.prompt?.kind === "password" && value?.save) savePassword(config, value.value);
      worker.postMessage({ type: "response", id: message.id, value });
    })
    .catch(() => worker.postMessage({ type: "response", id: message.id, value: null }));
}

function restoreWebSshSession({ sessionId, recovery }) {
  const connection = recovery.connection;
  if (!connection?.pipingServerUrl) return;
  const config = {
    ...connection,
    authKeySets: restoreAuthKeySets(recovery.authKeyFingerprints),
  };
  startWebSshSession(sessionId, config).catch((error) => {
    notifyExternalTerminal(sessionId, { message: error?.message || String(error) });
    writeExternalTerminal(sessionId, "\r\n\x1b[90mPress any key to reconnect.\x1b[0m\r\n");
  });
}

registerExternalTerminalRecovery("webssh", restoreWebSshSession);

function webSshRecovery(config) {
  const { authKeySets, ...connection } = config;
  const authKeyFingerprints = Array.isArray(authKeySets)
    ? authKeySets.map((key) => key?.sha256Fingerprint).filter(Boolean)
    : [];
  return { kind: "webssh", connection, authKeyFingerprints };
}

registerExternalTerminalAction("startWebSsh", {
  recovery: webSshRecovery,
  start: startWebSshSession,
});

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
    if (message?.type === "prompt") relayPrompt(worker, sessionId, message, config);
    if (message?.type === "hostKey" && message.trusted) trustHostKey(message.fingerprint);
    if (message?.type === "exit") {
      const reason = message.payload?.error || "Connection closed.";
      notifyExternalTerminal(sessionId, { message: reason });
      writeExternalTerminal(sessionId, "\r\n\x1b[90mPress any key to reconnect.\x1b[0m\r\n");
      setExternalTerminalReconnect(sessionId, () => {
        writeExternalTerminal(sessionId, "\x1b[2J\x1b[H");
        notifyExternalTerminal(sessionId, {
          message: "Reconnecting…",
          timeoutMs: 5000,
        });
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
  worker.postMessage({ type: "init" });
}
