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

const FEED_LIMIT = 100;
const RING_EVENT_PREFIX = "gear-shell:";

function api() {
  return window.GearShell?.events;
}

function Field({ label, children }) {
  return React.createElement(
    "label",
    { className: "playground-arg" },
    React.createElement("span", { className: "playground-arg-label" }, label),
    children,
  );
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
  return React.createElement(
    Field,
    { label: "Payload (JSON)" },
    React.createElement("textarea", {
      className: "playground-json-input",
      rows: 4,
      value: payload,
      spellCheck: false,
      onChange,
    }),
  );
}

function EmitForm({ onEmit }) {
  const [topic, setTopic] = useState("demo.topic");
  const [payload, setPayload] = useState(
    '{\n  "note": "hello from the playground"\n}',
  );
  const [error, setError] = useState("");
  const emit = () => composeEmit(topic, payload, setError, onEmit);
  return React.createElement(
    "div",
    { className: "playground-events-emit" },
    React.createElement(
      Field,
      { label: "Topic" },
      React.createElement("input", {
        type: "text",
        className: "playground-text-input",
        value: topic,
        onChange: (event) => setTopic(event.target.value),
      }),
    ),
    React.createElement(PayloadField, {
      payload,
      onChange: (event) => setPayload(event.target.value),
    }),
    error && React.createElement("p", { className: "playground-error" }, error),
    React.createElement(
      "div",
      { className: "playground-actions" },
      React.createElement(
        "button",
        { type: "button", className: "playground-run", onClick: emit },
        "Emit",
      ),
    ),
  );
}

function FeedItem({ item }) {
  const title = item.type === "ring.drain" ? "ring drain" : item.type;
  return React.createElement(
    "div",
    { className: "playground-events-item" },
    React.createElement(
      "div",
      { className: "playground-events-item-head" },
      React.createElement(
        "span",
        { className: "playground-events-type" },
        title,
      ),
      React.createElement(
        "span",
        { className: "playground-history-time" },
        new Date(item.ts).toLocaleTimeString(),
      ),
    ),
    React.createElement(
      "pre",
      { className: "playground-json playground-events-payload" },
      JSON.stringify(item.detail, null, 2),
    ),
  );
}

function EventsFeed({ feed }) {
  if (feed.length === 0) {
    return React.createElement(
      "p",
      { className: "playground-hint" },
      "No events yet — run an Explorer call (e.g. config.updateShell) " +
        "or emit one above.",
    );
  }
  return React.createElement(
    "div",
    { className: "playground-events-feed" },
    feed.map((item, index) =>
      React.createElement(FeedItem, {
        key: `${item.ts}-${index}`,
        item,
      })
    ),
  );
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
  return React.createElement(
    "div",
    { className: "playground-events" },
    React.createElement(
      "div",
      { className: "playground-events-head" },
      React.createElement(
        "div",
        null,
        React.createElement("h3", null, "Events"),
        React.createElement(
          "p",
          { className: "playground-hint" },
          "Live feed of gear-shell:* CustomEvents. The agent ring buffer " +
            "is only drained when you press Drain — observing never " +
            "consumes events an agent is waiting for.",
        ),
      ),
      React.createElement(
        "div",
        { className: "playground-actions" },
        React.createElement(
          "span",
          { className: "playground-pending" },
          `${pending} pending`,
        ),
        React.createElement(
          "button",
          { type: "button", className: "playground-run", onClick: drain },
          "Drain",
        ),
        React.createElement(
          "button",
          { type: "button", className: "playground-copy", onClick: clearFeed },
          "Clear feed",
        ),
      ),
    ),
    status && React.createElement("p", { className: "playground-ok" }, status),
    React.createElement(EmitForm, { onEmit }),
    React.createElement(EventsFeed, { feed }),
  );
}
