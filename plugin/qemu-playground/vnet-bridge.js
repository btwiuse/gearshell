// GearShell.vnet — WebSocket bridge to the vnet /x/net gateway.
//
// Implements the contract the qemu-wasm wsmux netdev expects via the
// plugin's `Module.wsmuxBridge`:
//
//   GearShell.vnet.attach({ handle, url, onFrame }) -> Promise
//   GearShell.vnet.send(handle, frame: Uint8Array)   -> Promise
//   GearShell.vnet.detach(handle)                   -> Promise
//
// Wire format: 1 raw L2 frame per WebSocket binary message, in both
// directions. The 4-byte BE length prefix is purely the server-side
// adapter framing inside `vnet.AcceptQemu` (see vnet/main.go and
// apptron/worker/cmd/worker/main.go qemuAdapter.Read/Write); it
// never appears on the wire.
//
// `attach` opens a WebSocket and resolves on the first onopen; on
// unexpected close (code < 4000) it reconnects with jittered backoff
// until `detach` is called. Codes >= 4000 are reserved for terminal
// failures (auth, policy, ...) and reject the attach promise.

const RECONNECT_DELAYS = [0, 250, 750, 2000, 5000, 10_000];

function pumpInbound(entry, data) {
  if (entry.closing) return;
  let frame;
  if (data instanceof ArrayBuffer) {
    frame = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    // TypedArray view — copy out a clean Uint8Array so the WASM
    // side does not see aliased memory.
    frame = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof Blob) {
    data.arrayBuffer().then((buf) => pumpInbound(entry, buf))
      .catch((err) => console.warn("vnet: blob decode failed", err));
    return;
  } else {
    return; // text frames are not part of the vnet protocol
  }
  try {
    entry.onFrame(frame);
  } catch (err) {
    console.error("vnet: onFrame threw", err);
  }
}

function flushQueue(entry) {
  if (!entry.ws || entry.ws.readyState !== WebSocket.OPEN) return;
  while (entry.queue.length > 0) {
    const frame = entry.queue.shift();
    try {
      entry.ws.send(frame);
    } catch (err) {
      entry.queue.unshift(frame);
      console.warn("vnet: send failed, will retry", err);
      break;
    }
  }
}

function scheduleReconnect(entry) {
  if (entry.closing) return;
  const idx = Math.min(entry.attempt, RECONNECT_DELAYS.length - 1);
  const delay = RECONNECT_DELAYS[idx];
  entry.retryToken = setTimeout(() => {
    entry.retryToken = null;
    openSocket(entry);
  }, delay);
  entry.attempt++;
}

function handleSocketClose(entry, event) {
  if (entry.closing) return;
  // Codes >= 4000 are reserved for terminal failures (auth,
  // policy, ...): surface them via the attach promise instead of
  // silently reconnecting.
  if (event.code >= 4000) {
    console.warn(`vnet: terminal close code=${event.code} reason=${event.reason || ""}`);
    if (entry.onTerminalClose) {
      const cb = entry.onTerminalClose;
      entry.onTerminalClose = null;
      cb(event);
    }
    return;
  }
  entry.ws = null;
  // First-time failure (no onOpen set yet) rejects; subsequent
  // unexpected closes schedule a reconnect.
  if (entry.onOpen) {
    const cb = entry.onOpen;
    entry.onOpen = null;
    cb(new Error(`vnet: closed before open (code=${event.code})`));
    return;
  }
  scheduleReconnect(entry);
}

function handleSocketOpen(entry, ws) {
  if (entry.closing) {
    try { ws.close(1000, ""); } catch (e) { /* ignore */ }
    return;
  }
  entry.attempt = 0; // reset backoff on successful connect
  flushQueue(entry);
  if (entry.onOpen) {
    const cb = entry.onOpen;
    entry.onOpen = null;
    cb();
  }
}

function handleSocketError(entry) {
  if (entry.onOpen) {
    const cb = entry.onOpen;
    entry.onOpen = null;
    cb(new Error("vnet: WebSocket error before open"));
  }
  console.warn("vnet: WebSocket error");
}

function bindSocketHandlers(entry, ws) {
  ws.onopen = () => handleSocketOpen(entry, ws);
  ws.onmessage = (event) => pumpInbound(entry, event.data);
  ws.onclose = (event) => handleSocketClose(entry, event);
  ws.onerror = () => handleSocketError(entry);
}

function openSocket(entry) {
  if (entry.closing) return;
  let ws;
  try {
    ws = new WebSocket(entry.url);
    ws.binaryType = "arraybuffer";
  } catch (err) {
    console.error("vnet: WebSocket ctor threw", err);
    scheduleReconnect(entry);
    return;
  }
  entry.ws = ws;
  bindSocketHandlers(entry, ws);
}

function attach({ handle, url, onFrame }) {
  if (!Number.isInteger(handle) || handle <= 0) {
    return Promise.reject(new Error("vnet.attach: handle must be a positive integer"));
  }
  if (typeof url !== "string" || !/^wss?:\/\//.test(url)) {
    return Promise.reject(new Error(`vnet.attach: url must be ws(s):// (got ${url})`));
  }
  if (typeof onFrame !== "function") {
    return Promise.reject(new Error("vnet.attach: onFrame must be a function"));
  }
  if (vnet._sessions.has(handle)) {
    return Promise.reject(new Error(`vnet.attach: handle ${handle} already attached`));
  }
  const entry = {
    handle, url, onFrame,
    queue: [],
    closing: false,
    ws: null,
    attempt: 0,
    retryToken: null,
    onOpen: null,
    onTerminalClose: null,
  };
  vnet._sessions.set(handle, entry);
  return new Promise((resolve, reject) => {
    entry.onOpen = (err) => {
      if (err) reject(err);
      else resolve(handle);
    };
    entry.onTerminalClose = (event) => {
      reject(new Error(`vnet: terminal close code=${event.code}`));
    };
    openSocket(entry);
  });
}

function send(handle, frame) {
  const entry = vnet._sessions.get(handle);
  if (!entry) return Promise.reject(new Error(`vnet.send: handle ${handle} not attached`));
  if (!(frame instanceof Uint8Array)) {
    return Promise.reject(new Error(`vnet.send: frame must be a Uint8Array`));
  }
  // Copy so the caller can reuse its buffer. The WASM side hands us
  // a freshly-allocated Uint8Array per send, so this is cheap.
  const copy = new Uint8Array(frame.byteLength);
  copy.set(frame);
  entry.queue.push(copy);
  if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
    flushQueue(entry);
  }
  return Promise.resolve();
}

function detach(handle) {
  const entry = vnet._sessions.get(handle);
  if (!entry) return Promise.resolve();
  entry.closing = true;
  if (entry.retryToken) {
    clearTimeout(entry.retryToken);
    entry.retryToken = null;
  }
  if (entry.ws) {
    try { entry.ws.close(1000, ""); } catch (e) { /* ignore */ }
    entry.ws = null;
  }
  vnet._sessions.delete(handle);
  return Promise.resolve();
}

const vnet = {
  attach,
  send,
  detach,
  _sessions: new Map(),
};

if (typeof window !== "undefined") {
  window.GearShell = window.GearShell || {};
  if (!window.GearShell.vnet) window.GearShell.vnet = vnet;
}

export default vnet;