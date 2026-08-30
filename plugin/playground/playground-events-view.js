// playground-events-view.js — the Events tab of the GearShell API
// Playground: a live feed of every `gear-shell:*` window CustomEvent
// (the mirror emit() publishes), the agent ring-buffer state
// (events.pending / drain), and a small emit composer for testing
// custom topics.
//
// The feed is observed, never consumed: the agent ring buffer is
// drained only when the user presses "Drain", so the Playground cannot
// silently steal events from a polling agent. Ring drains are shown as
// feed entries so the effect is visible.

import React, { useEffect, useState } from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

const FEED_LIMIT = 100;
const RING_EVENT_PREFIX = "gear-shell:";

function api() {
  return window.GearShell?.events;
}

function Field({ label, children }) {
  return html`
    <label className="playground-arg">
      <span className="playground-arg-label">${label}</span>
      ${children}
    </label>
  `;
}

function composeEmit(topic, payload, setError, onEmit) {
  const name = topic.trim();
  if (!name) {
    setError("A topic is required.");
    return;
  }
  let parsed;
  try {
    parsed = payload.trim() ? JSON.parse(payload) : {};
  } catch (caught) {
    setError(`Invalid payload JSON: ${caught?.message || caught}`);
    return;
  }
  setError("");
  onEmit(name, parsed);
}

function PayloadField({ payload, onChange }) {
  return html`
    <${Field} label="Payload (JSON)">
      <textarea
        className="playground-json-input"
        rows=${4}
        value=${payload}
        spellCheck=${false}
        onChange=${onChange}
      ></textarea>
    </${Field}>
  `;
}

function EmitForm({ onEmit }) {
  const [topic, setTopic] = useState("demo.topic");
  const [payload, setPayload] = useState(
    '{\n  "note": "hello from the playground"\n}',
  );
  const [error, setError] = useState("");
  const emit = () => composeEmit(topic, payload, setError, onEmit);
  return html`
    <div className="playground-events-emit">
      <${Field} label="Topic">
        <input
          type="text"
          className="playground-text-input"
          value=${topic}
          onChange=${(event) => setTopic(event.target.value)}
        />
      </${Field}>
      <${PayloadField} payload=${payload} onChange=${(event) => setPayload(event.target.value)}/>
      ${error && html`<p className="playground-error">${error}</p>`}
      <div className="playground-actions">
        <button type="button" className="playground-run" onClick=${emit}>Emit</button>
      </div>
    </div>
  `;
}

function FeedItem({ item }) {
  const title = item.type === "ring.drain" ? "ring drain" : item.type;
  return html`
    <div className="playground-events-item">
      <div className="playground-events-item-head">
        <span className="playground-events-type">${title}</span>
        <span className="playground-history-time">${new Date(item.ts).toLocaleTimeString()}</span>
      </div>
      <pre className="playground-json playground-events-payload">${JSON.stringify(item.detail, null, 2)}</pre>
    </div>
  `;
}

function EventsFeed({ feed }) {
  if (feed.length === 0) {
    return html`
      <p className="playground-hint">No events yet — run an Explorer call (e.g. config.updateShell) or emit one above.</p>
    `;
  }
  return html`
    <div className="playground-events-feed">
      ${feed.map((item, index) =>
        html`<${FeedItem} key=${`${item.ts}-${index}`} item=${item}/>`,
      )}
    </div>
  `;
}

// Observe every CustomEvent dispatch (emit() publishes each topic as a
// `gear-shell:<topic>` window event). Patching dispatchEvent is the only
// way to observe an arbitrary topic without subscribing to each one;
// returns the restore function for unmount.
function installDispatchObserver(pushItem) {
  const original = window.dispatchEvent.bind(window);
  const patched = (event) => {
    if (
      typeof event?.type === "string" &&
      event.type.startsWith(RING_EVENT_PREFIX)
    ) {
      pushItem({ ts: Date.now(), type: event.type, detail: event.detail });
    }
    return original(event);
  };
  window.dispatchEvent = patched;
  return () => {
    if (window.dispatchEvent === patched) window.dispatchEvent = original;
  };
}

function drainRingFeed(pushItem, setStatus, refreshPending) {
  const result = api()?.drain?.();
  const events = result?.events || [];
  if (events.length > 0) {
    pushItem({
      ts: Date.now(),
      type: "ring.drain",
      detail: { count: events.length, events },
    });
  }
  setStatus(
    result?.ok
      ? `Drained ${events.length} buffered event(s).`
      : result?.error || "Drain failed.",
  );
  refreshPending();
}

function useEventFeed() {
  const [feed, setFeed] = useState([]);
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState("");

  const pushItem = (item) => {
    setFeed((prev) => [item, ...prev].slice(0, FEED_LIMIT));
  };
  const refreshPending = () => {
    const result = api()?.pending?.();
    setPending(result?.ok ? (result.count ?? 0) : 0);
  };

  useEffect(() => {
    refreshPending();
    const interval = window.setInterval(refreshPending, 2000);
    const restore = installDispatchObserver(pushItem);
    return () => {
      window.clearInterval(interval);
      restore();
    };
  }, []);

  const drain = () => drainRingFeed(pushItem, setStatus, refreshPending);
  const clearFeed = () => setFeed([]);

  const onEmit = (topic, payload) => {
    try {
      const result = api()?.emit?.(topic, payload);
      setStatus(
        result?.ok ? `Emitted ${topic}.` : result?.error || "Emit failed.",
      );
      refreshPending();
    } catch (caught) {
      setStatus(caught?.message || String(caught));
    }
  };

  return { feed, pending, status, drain, clearFeed, onEmit };
}

export function EventsView() {
  const { feed, pending, status, drain, clearFeed, onEmit } = useEventFeed();
  return html`
    <div className="playground-events">
      <div className="playground-events-head">
        <div>
          <h3>Events</h3>
          <p className="playground-hint">Live feed of gear-shell:* CustomEvents. The agent ring buffer is only drained when you press Drain — observing never consumes events an agent is waiting for.</p>
        </div>
        <div className="playground-actions">
          <span className="playground-pending">${pending} pending</span>
          <button type="button" className="playground-run" onClick=${drain}>Drain</button>
          <button type="button" className="playground-copy" onClick=${clearFeed}>Clear feed</button>
        </div>
      </div>
      ${status && html`<p className="playground-ok">${status}</p>`}
      <${EmitForm} onEmit=${onEmit}/>
      <${EventsFeed} feed=${feed}/>
    </div>
  `;
}
