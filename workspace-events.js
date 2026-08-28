// workspace-events.js — in-memory event pub/sub + durable agent ring
// buffer (split out of workspace-api.js for the 500-line rule). Agents
// poll the bounded buffer via events.drain; on/off/emit serve in-page
// callers and mirror to window CustomEvents.
//
// A2: the ring buffer is persisted to localStorage (gear-shell-events)
// so events survive a page reload. Each event carries a monotonic id
// and the last-drained id is stored separately, so an agent that was
// not polling (e.g. while its task finished and the page reloaded)
// catches up via events.drain without ever receiving an event twice.

// --- Event pub/sub (in-memory + window CustomEvent mirror) ---
const listeners = new Map();

const eventBuffer = [];
export { eventBuffer };
const EVENT_BUFFER_LIMIT = 200;
const EVENT_STORE_KEY = "gear-shell-events";
const EVENT_DRAINED_KEY = "gear-shell-events-drained";

let eventSeq = 0;

function readPersistedEvents() {
  try {
    const raw = localStorage.getItem(EVENT_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedEvents(events) {
  try {
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable (private mode / quota); events stay in-memory
  }
}

function readDrainedSeq() {
  try {
    return Number(localStorage.getItem(EVENT_DRAINED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeDrainedSeq(seq) {
  try {
    localStorage.setItem(EVENT_DRAINED_KEY, String(seq));
  } catch {
    // best-effort
  }
}

function trimBuffer() {
  if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
    eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
  }
}

// Restore the persisted ring on boot (called from initWorkspaceApi
// before the api is exposed to agents). Ids already drained before the
// reload are skipped; the seq counter resumes above both the persisted
// ids and the drained marker so a marker can never swallow fresh events.
export function seedEventBuffer() {
  const persisted = readPersistedEvents();
  eventSeq = Math.max(
    eventSeq,
    readDrainedSeq(),
    ...persisted.map((event) => event.id ?? 0),
  );
  const drained = readDrainedSeq();
  eventBuffer.length = 0;
  eventBuffer.push(
    ...persisted.filter((event) => (event.id ?? 0) > drained)
      .slice(-EVENT_BUFFER_LIMIT),
  );
}

export function pushEvent(topic, payload) {
  const event = {
    id: ++eventSeq,
    topic,
    payload: payload ?? null,
    ts: Date.now(),
  };
  eventBuffer.push(event);
  trimBuffer();
  const persisted = readPersistedEvents();
  persisted.push(event);
  writePersistedEvents(persisted.slice(-EVENT_BUFFER_LIMIT));
}

// Splice the buffered events and advance the persisted drained
// high-water mark, pruning everything below it from the store.
export function drainEvents() {
  const drained = eventBuffer.splice(0, eventBuffer.length);
  if (drained.length > 0) {
    const maxId = drained[drained.length - 1].id;
    writeDrainedSeq(maxId);
    writePersistedEvents(
      readPersistedEvents().filter((event) => (event.id ?? 0) > maxId)
        .slice(-EVENT_BUFFER_LIMIT),
    );
  }
  return drained;
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
