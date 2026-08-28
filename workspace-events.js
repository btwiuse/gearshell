// workspace-events.js — in-memory event pub/sub + agent ring buffer
// (split out of workspace-api.js for the 500-line rule). Agents poll
// the bounded buffer via events.drain; on/off/emit serve in-page
// callers and mirror to window CustomEvents.

// --- Event pub/sub (in-memory + window CustomEvent mirror) ---
const listeners = new Map();

// Bounded ring buffer so AGENTS can read page events: the jsfs bridge is
// synchronous and functions do not survive JSON serialization, so a
// callback-based subscribe cannot cross the boundary. Agents poll
// events.drain (or `gctl events.drain`) at the same 800ms rhythm used
// for tasks.output and get everything buffered since the last drain.
const eventBuffer = [];
export { eventBuffer };
const EVENT_BUFFER_LIMIT = 200;

export function pushEvent(topic, payload) {
  eventBuffer.push({ topic, payload: payload ?? null, ts: Date.now() });
  if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
    eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
  }
}

export function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => off(topic, fn);
}

export function off(topic, fn) {
  listeners.get(topic)?.delete(fn);
}

export function emit(topic, payload) {
  pushEvent(topic, payload);
  for (const fn of [...(listeners.get(topic) || [])]) {
    try {
      fn(payload);
    } catch {
      // keep dispatching to the rest
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent(`gear-shell:${topic}`, { detail: payload }),
    );
  } catch {
    // non-browser environment
  }
  return { ok: true };
}

// Dockview panel lifecycle -> event ring buffer. Called from app-shell's
// onReady where the other dockview hooks live (getDockviewApi() is null
// before then, so the api instance is passed in).
export function wirePanelEvents(api) {
  if (!api) return;
  const info = (panel) => ({
    id: panel?.id ?? null,
    component: typeof panel?.params?.panelType === "string"
      ? panel.params.panelType
      : null,
    title: panel?.title ?? null,
  });
  api.onDidAddPanel?.((event) => {
    if (event?.panel) pushEvent("panel.added", info(event.panel));
  });
  api.onDidRemovePanel?.((event) => {
    if (event?.panel) pushEvent("panel.removed", info(event.panel));
  });
  api.onDidActivePanelChange?.((event) => {
    if (event?.panel) pushEvent("panel.activated", info(event.panel));
  });
}
