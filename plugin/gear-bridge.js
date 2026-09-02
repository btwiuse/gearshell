// gear-bridge.js — iframe-side bridge to the shell's window.GearShell API.
//
// Load this from inside an iframe plugin page with a plain <script> tag:
//
//   <script src="/gear-bridge.js"></script>
//
// It replaces the iframe's window.GearShell with a Proxy that turns every
// method call into a postMessage request to the parent shell, so an
// iframe plugin can drive the same API an in-page component plugin gets
// (through the SAME permissions.api whitelist):
//
//   const list = await GearShell.panels.list();
//   const song = await GearShell.music.nowPlaying();
//
// Only JSON-serializable arguments are supported; function arguments
// (callbacks) are rejected — postMessage cannot carry them. Events go
// through the dedicated subscribe channel (see below).
//
// Wire protocol (shell side: plugins-iframe-api.js):
//
//   iframe -> shell  { gear: { id, method: "music.play", args: [] } }
//   shell  -> iframe { gear: { id, ok, result } }      // reply
//   shell  -> iframe { gear: { event: { topic, payload } } }  // push
//
// Event subscription (callbacks cannot cross postMessage):
//
//   GearShell.subscribe("task.status");          // opens the channel
//   GearShell.on("task.status", (payload) => { ... });  // local listener
//   GearShell.off("task.status", handler);      // drop a listener
//   GearShell.unsubscribe("task.status");       // close the channel
//
// The bridge unsubscribes all open channels automatically when the
// iframe page unloads, so the shell never leaks listeners.
//
// The top-level shell page already exposes the real (synchronous)
// window.GearShell from workspace-api.js; the guard below leaves it
// untouched, so gear-bridge.js is safe to load on any page.

// Install the bridge only inside an iframe: the top-level shell page
// already has the real (synchronous) window.GearShell. The guard is a
// plain block (class declarations are block-scoped, so a classic-script
// load adds no globals beyond window.GearShell itself).

if (window.top !== window.self) {
  class GearBridgeClient {
    constructor() {
      this.callTimeoutMs = 8000;
      this.seq = 0;
      this.pending = new Map(); // id -> { resolve, reject, timer }
      this.listeners = new Map(); // topic -> Set<fn> (local, never posted)
      this.subscribed = new Set(); // topics the shell channel is open for
      this.bridgeMethods = {
        subscribe: (topic) => this.bridgeSubscribe(topic),
        unsubscribe: (topic) => this.bridgeUnsubscribe(topic),
        on: (topic, fn) => this.bridgeOn(topic, fn),
        off: (topic, fn) => this.bridgeOff(topic, fn),
      };
    }

    install() {
      window.addEventListener("message", (event) => this.onMessage(event));
      window.addEventListener("pagehide", () => this.onPageHide());
      window.GearShell = this.pathProxy("");
    }

    invoke(path, args) {
      return new Promise((resolve, reject) => {
        if (this.rejectUnserializable(args, reject)) return;
        const id = ++this.seq;
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("gear bridge timeout: " + path));
        }, this.callTimeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        window.parent.postMessage(
          { gear: { id, method: path, args } },
          "*",
        );
      });
    }

    rejectUnserializable(args, reject) {
      for (const arg of args) {
        if (typeof arg === "function") {
          reject(
            new Error(
              "gear bridge: function arguments are not supported " +
                "(callbacks cannot cross postMessage)",
            ),
          );
          return true;
        }
      }
      return false;
    }

    // Any property access returns a callable Proxy: calling it invokes
    // the dotted path, so GearShell.music.play(...) postMessages
    // "music.play" while GearShell.music (no call) is a chainable node.
    pathProxy(path) {
      const self = this;
      const target = function () {
        return self.invoke(path, [...arguments]);
      };
      return new Proxy(target, {
        get: (_t, key) => {
          if (key === "then") return undefined; // await-safe
          if (Object.prototype.hasOwnProperty.call(self.bridgeMethods, key)) {
            return self.bridgeMethods[key];
          }
          return self.pathProxy(path ? path + "." + key : key);
        },
      });
    }

    // Bridge-local methods shadow API paths of the same name (none of
    // the shell namespaces use these names today).
    bridgeSubscribe(topic) {
      topic = String(topic || "");
      return this.invoke("subscribe", [topic]).then((res) => {
        if (res && res.ok === false) {
          throw new Error(res.error || "subscribe failed");
        }
        this.subscribed.add(topic);
        return res;
      });
    }

    bridgeUnsubscribe(topic) {
      topic = String(topic || "");
      this.subscribed.delete(topic);
      return this.invoke("unsubscribe", [topic]);
    }

    bridgeOn(topic, fn) {
      if (typeof fn !== "function") return;
      if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
      this.listeners.get(topic).add(fn);
      // Open the host channel lazily so the very first events.on call
      // gets subsequent events delivered. Without this the bridge
      // would silently drop every event push — the old behaviour
      // required two-step subscribe+on which no plugin actually did,
      // leaving the entire live-update surface dead. The bridge
      // dedupes by topic internally so calling subscribe twice is a
      // no-op.
      if (!this.subscribed.has(topic)) {
        this.bridgeSubscribe(topic).catch(() => {
          // Best-effort: if the host rejects (permission revoked etc.)
          // we still keep the local listener so re-subscribing later
          // can succeed without re-adding the handler.
        });
      }
      return () => this.bridgeOff(topic, fn);
    }

    bridgeOff(topic, fn) {
      this.listeners.get(topic)?.delete(fn);
    }

    // Dispatch one incoming message: an event push or a call reply.
    onMessage(event) {
      const gear = event.data && event.data.gear;
      if (!gear) return;
      if (gear.event) {
        this.dispatchEventPush(gear.event);
        return;
      }
      if (typeof gear.id === "undefined" || !this.pending.has(gear.id)) return;
      const entry = this.pending.get(gear.id);
      this.pending.delete(gear.id);
      clearTimeout(entry.timer);
      if (gear.ok) {
        entry.resolve(gear.result);
      } else {
        entry.reject(new Error(String(gear.error || "gear bridge error")));
      }
    }

    dispatchEventPush(evt) {
      const set = this.listeners.get(evt.topic);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(evt.payload);
        } catch {
          // keep dispatching to the rest
        }
      }
    }

    // Close every open channel when the iframe page goes away so the
    // shell side can drop its listeners (the shell cannot observe
    // iframe unload across origins).
    onPageHide() {
      for (const topic of this.subscribed) {
        try {
          window.parent.postMessage(
            { gear: { id: ++this.seq, method: "unsubscribe", args: [topic] } },
            "*",
          );
        } catch {
          // the parent is already gone
        }
      }
    }
  }

  new GearBridgeClient().install();
}
