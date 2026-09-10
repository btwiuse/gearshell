// inference/session.js — chat session registry.
//
// The host owns one model instance (BitgpuChat) at a time. Sessions
// are lightweight wrappers that hold a messages array, an abort
// controller, and a default generation config. Each session sends
// through the same engine — there is no per-session GPU isolation, so
// the registry caps the total at MAX_SESSIONS to prevent one agent
// from monopolising the host.
//
// Event surface: `session.stream(messages, options)` returns an
// AsyncIterable of the same {type, ...} events the plugin's adapter
// used to emit. The host-worker postMessages these out to the shell.

import { MAX_SESSIONS, SESSION_IDLE_MS } from "./protocol.js";

let sessionSeq = 0;

export class ChatSession {
  constructor({ host, model, options }) {
    this.id = ++sessionSeq;
    this.host = host;
    this.model = model;
    this.systemPrompt = options.systemPrompt ?? null;
    this.generation = options.generation ?? {};
    this.messages = [];
    this.lastUsedAt = performance.now();
    this.aborted = false;
  }

  setMessages(messages) {
    this.messages = messages;
    this.lastUsedAt = performance.now();
  }

  async *send(messages, options = {}) {
    this.lastUsedAt = performance.now();
    const abort = new AbortController();
    const compositeSignal = composeSignals(abort.signal, options.signal);
    const streamOptions = {
      ...this.generation,
      ...options,
      signal: compositeSignal,
    };
    try {
      for await (const event of this.host.engine.streamTurn(messages, streamOptions)) {
        this.lastUsedAt = performance.now();
        yield event;
      }
    } finally {
      compositeSignal.dispose();
    }
  }

  pushToolResult() {
    // Tool round-trips are handled by the consumer (shell-side agent
    // loop) and pushed back via send() with new messages. The session
    // itself is stateless about tools.
  }

  reset() {
    this.host.engine.reset();
    this.lastUsedAt = performance.now();
  }

  close() {
    this.aborted = true;
  }
}

function composeSignals(a, b) {
  if (!a && !b) return null;
  if (!a) return wrapSignal(b);
  if (!b) return wrapSignal(a);
  const controller = new AbortController();
  const onA = () => controller.abort(a.reason);
  const onB = () => controller.abort(b.reason);
  if (a.aborted) controller.abort(a.reason);
  else a.addEventListener("abort", onA, { once: true });
  if (b.aborted) controller.abort(b.reason);
  else b.addEventListener("abort", onB, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      a.removeEventListener("abort", onA);
      b.removeEventListener("abort", onB);
    },
  };
}

function wrapSignal(signal) {
  return {
    signal,
    dispose() {},
  };
}

export class SessionRegistry {
  constructor(host) {
    this.host = host;
    this.sessions = new Map();
    this.idleSweep = setInterval(() => this.sweepIdle(), Math.min(SESSION_IDLE_MS, 60000));
  }

  create({ model, systemPrompt, generation }) {
    if (this.sessions.size >= MAX_SESSIONS) {
      // LRU-evict the oldest session to make room. The host keeps the
      // model resident; only the session metadata is dropped. The
      // agent loop can re-create after the next send.
      const lru = [...this.sessions.values()].sort(
        (a, b) => a.lastUsedAt - b.lastUsedAt,
      )[0];
      if (lru) this.drop(lru.id);
    }
    const session = new ChatSession({
      host: this.host,
      model,
      options: { systemPrompt, generation },
    });
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id) ?? null;
  }

  drop(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.close();
    this.sessions.delete(id);
    return true;
  }

  sweepIdle() {
    const now = performance.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastUsedAt > SESSION_IDLE_MS) {
        this.drop(id);
      }
    }
  }

  status() {
    return {
      count: this.sessions.size,
      max: MAX_SESSIONS,
      sessions: [...this.sessions.values()].map((s) => ({
        id: s.id,
        model: s.model.id,
        messages: s.messages.length,
        lastUsedAt: s.lastUsedAt,
      })),
    };
  }

  shutdown() {
    clearInterval(this.idleSweep);
    for (const id of [...this.sessions.keys()]) this.drop(id);
  }
}
