const sessions = new Map();
let sessionCounter = 0;

function push(entry, topic, payload) {
  try {
    entry.source.postMessage({ gear: { event: { topic, payload } } }, entry.origin);
  } catch {}
}

export function createExternalTerminal({ source, origin, title }) {
  const sessionId = `external-${++sessionCounter}`;
  sessions.set(sessionId, {
    sessionId,
    source,
    origin,
    title: String(title || "External terminal"),
    output: new Set(),
    outputBuffer: [],
    exit: new Set(),
    prompt: new Set(),
    pendingPrompt: null,
  });
  return sessions.get(sessionId);
}

export function getExternalTerminal(sessionId) {
  return sessions.get(sessionId) ?? null;
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

export function sendExternalTerminalInput(sessionId, data) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  push(entry, "terminal.external.data", { sessionId, data });
  return true;
}

export function resizeExternalTerminal(sessionId, cols, rows, xpixel, ypixel) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  push(entry, "terminal.external.resize", { sessionId, cols, rows, xpixel, ypixel });
  return true;
}

export function disposeExternalTerminal(sessionId) {
  const entry = getExternalTerminal(sessionId);
  if (!entry) return false;
  entry.pendingPrompt?.resolve(null);
  push(entry, "terminal.external.close", { sessionId });
  sessions.delete(sessionId);
  return true;
}
