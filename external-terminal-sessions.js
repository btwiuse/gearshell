const sessions = new Map();

function push(entry, topic, payload) {
  try {
    entry.source?.postMessage({ gear: { event: { topic, payload } } }, entry.origin);
  } catch {}
}

export function createExternalTerminal({ source, origin, title, sessionId: requestedSessionId }) {
  const sessionId = String(requestedSessionId || crypto.randomUUID());
  if (sessions.has(sessionId)) throw new Error(`external terminal already exists: ${sessionId}`);
  sessions.set(sessionId, {
    sessionId,
    source,
    origin,
    title: String(title || "External terminal"),
    output: new Set(),
    outputBuffer: [],
    exit: new Set(),
    reconnect: null,
    notification: new Set(),
    pendingNotification: null,
    input: new Set(),
    resize: new Set(),
    size: null,
    sizeWaiters: new Set(),
    prompt: new Set(),
    pendingPrompt: null,
    dispose: null,
  });
  return sessions.get(sessionId);
}

export function getExternalTerminal(sessionId) {
  return sessions.get(sessionId) ?? null;
}

export function setExternalTerminalDispose(sessionId, dispose) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.dispose = dispose;
  return true;
}

export function writeExternalTerminal(sessionId, data) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  if (entry.output.size === 0) entry.outputBuffer.push(data);
  for (const listener of entry.output) listener(data);
  return true;
}

export function exitExternalTerminal(sessionId, payload = {}) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  for (const listener of entry.exit) listener(payload);
  return true;
}

export function setExternalTerminalReconnect(sessionId, reconnect) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.reconnect = reconnect;
  return true;
}

export function onExternalTerminalOutput(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.output.add(listener);
  for (const data of entry.outputBuffer.splice(0)) listener(data);
  return () => entry.output.delete(listener);
}

export function onExternalTerminalExit(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.exit.add(listener);
  return () => entry.exit.delete(listener);
}

export function promptExternalTerminal(sessionId, prompt) {
  const entry = getExternalTerminal(sessionId);
  if (!entry || entry.pendingPrompt) return Promise.reject(new Error("external terminal prompt unavailable"));
  return new Promise((resolve) => {
    entry.pendingPrompt = { prompt, resolve };
    for (const listener of entry.prompt) listener(prompt);
  });
}

export function respondExternalTerminalPrompt(sessionId, value) {
  const entry = getExternalTerminal(sessionId);
  const pending = entry?.pendingPrompt;
  if (!pending) return false;
  entry.pendingPrompt = null;
  pending.resolve(value);
  return true;
}

export function onExternalTerminalPrompt(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.prompt.add(listener);
  if (entry.pendingPrompt) listener(entry.pendingPrompt.prompt);
  return () => entry.prompt.delete(listener);
}

export function pushExternalTerminalEvent(sessionId, topic, payload) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  push(entry, topic, { sessionId, ...payload });
  return true;
}

export function notifyExternalTerminal(sessionId, notification) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.pendingNotification = notification;
  for (const listener of entry.notification) listener(notification);
  return true;
}

export function onExternalTerminalNotification(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.notification.add(listener);
  if (entry.pendingNotification) listener(entry.pendingNotification);
  return () => entry.notification.delete(listener);
}

export function onExternalTerminalInput(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.input.add(listener);
  return () => entry.input.delete(listener);
}

export function onExternalTerminalResize(sessionId, listener) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return () => {};
  entry.resize.add(listener);
  if (entry.size) listener(entry.size);
  return () => entry.resize.delete(listener);
}

export function waitForExternalTerminalSize(sessionId) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return Promise.reject(new Error("unknown external terminal"));
  if (entry.size) return Promise.resolve(entry.size);
  return new Promise((resolve) => entry.sizeWaiters.add(resolve));
}

export function sendExternalTerminalInput(sessionId, data) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  if (entry.reconnect) {
    const reconnect = entry.reconnect;
    entry.reconnect = null;
    reconnect();
    return true;
  }
  for (const listener of entry.input) listener(data);
  return true;
}

export function resizeExternalTerminal(sessionId, cols, rows, xpixel, ypixel) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.size = { cols, rows, xpixel, ypixel };
  for (const resolve of entry.sizeWaiters) resolve(entry.size);
  entry.sizeWaiters.clear();
  for (const listener of entry.resize) listener(entry.size);
  return true;
}

export function disposeExternalTerminal(sessionId) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.pendingPrompt?.resolve(null);
  entry.dispose?.();
  push(entry, "terminal.external.close", { sessionId });
  sessions.delete(sessionId);
  return true;
}

// Action registry: how an external terminal is started (e.g. WebSSH, WeTTY)
// and how its connection descriptor is rebuilt for layout recovery.
const actions = new Map();

export function registerExternalTerminalAction(name, action) {
  actions.set(name, action);
}

export function getExternalTerminalAction(name) {
  return actions.get(name) ?? null;
}

// Recovery registry: kind -> (panel, recovery) -> restored session. The
// layout layer calls restoreExternalTerminalSessions after a page reload
// with the live dockview panel list; each registered adapter rebuilds its
// specific kind of session.
const recoveryAdapters = new Map();

export function registerExternalTerminalRecovery(kind, restore) {
  recoveryAdapters.set(kind, restore);
}

export function restoreExternalTerminalSessions(api) {
  for (const panel of api.panels) {
    if (panel.params?.panelType !== "external-terminal") continue;
    const recovery = panel.params.recovery;
    const restore = recoveryAdapters.get(recovery?.kind);
    if (!restore) continue;
    createExternalTerminal({ sessionId: panel.params.sessionId, title: panel.title });
    restore({ sessionId: panel.params.sessionId, recovery });
  }
}
