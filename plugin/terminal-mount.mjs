// plugin/terminal-mount.mjs — one spot for the "mount a bare xterm into a
// DOM anchor and drive a kernel terminal session" flow shared by every
// plugin page and the Home demo.
//
// Before this, six places (plugin/rv64, plugin/v86, plugin/bbtex-iframe,
// plugin/terminal-frame, plugin/iframe-template-plugin, plugin/home) each
// copied the same ~50 lines: load the shared xterm bundle, build + open a
// Terminal with FitAddon, apply the wanix addon set, wire xterm.onData →
// write / term.data → write, resize (fit + winch with real pixel dims) on
// ResizeObserver + window resize, and tap-focus. This module keeps that
// mechanical core in one function; each page keeps only its genuinely
// page-specific bits (status bar, card layout, theming, transform).
//
// The kernel-session surface differs between transports:
//   - same-document (Home):  api.onData(id, cb) / api.onExit(id, cb)
//   - iframe bridge:         api.on("term.data", h) + api.subscribe(...),
//                            filtered by payload.sessionId
// So the caller passes a tiny `session` facade (below) that adapts the
// page's transport to the uniform create/write/resize/dispose/onOutput/
// onExit shape the helper drives.
//
// Usage:
//   const session = {
//     create: () => api.create(),
//     write: (id, d) => api.write(id, d),
//     resize: (id, c, r, x, y) => api.resize(id, c, r, x, y),
//     dispose: (id) => api.dispose(id),
//     onOutput: (id, cb) => ...,  // subscribe output bytes, return teardown
//     onExit: (id, cb) => ...,    // subscribe exit, return teardown
//   };
//   const { term, fit, sessionId, dispose } = await mountTerminal(anchor, session, {
//     terminal: { fontFamily, fontSize, theme, ... },   // any Terminal options
//     transformInput: (data) => data,                   // optional input rewrite
//     setupAddons: (term, libs) => {},                   // extra addon setup (called last)
//     onData: (bytes) => {},                             // observe each output chunk
//     onExit: (payload) => {},                           // observe session exit
//     exitMessage: "\x1b[33m[Process exited]\x1b[0m",      // line on exit; false to skip
//   });

import { loadXtermBundle, applyXtermAddons } from "./xterm-bundle.mjs";

let bundlePromise = null;
function bundle() {
  if (!bundlePromise) bundlePromise = loadXtermBundle();
  return bundlePromise;
}

// Mobile tap-to-refocus: touch browsers may not synthesize the mousedown
// xterm listens for after the terminal lost focus, so a tap would never
// reopen the keyboard. Focus directly on a tap; scrolls are ignored.
function enableTapFocus(term, host) {
  let touchStart = null;
  host.addEventListener("touchstart", function (event) {
    const t = event.changedTouches[0];
    if (t) touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  host.addEventListener("touchend", function (event) {
    if (!touchStart) return;
    const t = event.changedTouches[0];
    const moved = t
      ? Math.abs(t.clientX - touchStart.x) + Math.abs(t.clientY - touchStart.y)
      : 0;
    touchStart = null;
    if (moved < 12) term.focus();
  }, { passive: true });
}

// The winch frame the wanix-term element writes: "cols rows xpixel ypixel"
// where the pixels are the terminal element's CSS size (elements/term.js).
function winchFor(anchor, term) {
  const screen = anchor.querySelector(".xterm-screen") || anchor;
  return [
    term.cols,
    term.rows,
    screen.offsetWidth || 0,
    screen.offsetHeight || 0,
  ];
}

// Mount and drive a headless kernel terminal session into `anchor` via the
// `session` facade. Returns a handle for resize/cleanup. Resolves only once
// the xterm bundle is loaded, the terminal is open, and a session is
// created (the xterm bundle is loaded once and cached across mounts).
export async function mountTerminal(anchor, session, options = {}) {
  const libs = await bundle();
  const term = new libs.Terminal({
    convertEol: true,
    cursorBlink: true,
    allowProposedApi: true,
    ...(options.terminal || {}),
  });
  const fit = new libs.FitAddon();
  term.loadAddon(fit);
  term.open(anchor);
  applyXtermAddons(term, libs);
  if (typeof options.setupAddons === "function") {
    options.setupAddons(term, libs);
  }
  enableTapFocus(term, anchor);

  const created = await session.create();
  const sessionId = created?.sessionId;
  if (!sessionId) {
    term.dispose();
    throw new Error((created && created.error) || "terminal.create failed");
  }

  // forward current size to the kernel winch (xterm resize events);
  // NOT fit() — fit()→resize→fit() would loop.
  const forwardSize = () => {
    try {
      session.resize(sessionId, ...winchFor(anchor, term));
    } catch {}
  };
  // fit to the anchor then forward (anchor ResizeObserver / window resize).
  const refitAndResize = () => {
    try {
      fit.fit();
      forwardSize();
    } catch {}
  };

  const offOutput = session.onOutput(sessionId, (data) => {
    term.write(data);
    options.onData?.(data);
  });
  const offExit = session.onExit(sessionId, (payload) => {
    if (options.exitMessage !== false) {
      const msg = options.exitMessage || "\x1b[33m[Process exited]\x1b[0m";
      term.write("\r\n" + msg + "\r\n");
    }
    options.onExit?.(payload);
  });
  term.onData((data) => {
    const out = options.transformInput ? options.transformInput(data) : data;
    try {
      session.write(sessionId, new TextEncoder().encode(out));
    } catch {}
  });
  term.onResize(forwardSize);

  const observer = new ResizeObserver(refitAndResize);
  observer.observe(anchor);
  window.addEventListener("resize", refitAndResize);
  refitAndResize();

  return {
    term,
    fit,
    sessionId,
    dispose: () => {
      observer.disconnect();
      window.removeEventListener("resize", refitAndResize);
      offOutput?.();
      offExit?.();
      term.dispose();
      try {
        session.dispose(sessionId);
      } catch {}
    },
  };
}

// Present the terminal to the guest as ghostty. Guests like Crush/Claude
// gate OSC 9;4 progress reporting on the identity advertised in the DCS
// ">|" handshake, so without this rewrite they never emit the progress
// sequence. Spread the returned object into mountTerminal's options; it
// supplies the ghostty termName and a transformInput that rewrites the
// handshake, composing with any transformInput already in `options`.
export function ghosttyIdentity(options = {}) {
  const base = options.transformInput;
  const rewrite = (data) =>
    data.replace("\u001bP>|xterm.js(", "\u001bP>|ghostty(");
  return {
    terminal: { ...(options.terminal || {}), termName: "ghostty" },
    transformInput: base ? (data) => base(rewrite(data)) : rewrite,
  };
}

// Adapter for the same-document terminal API (window.GearShell.terminal,
// workspace-terminal-api.js): output/exit ride local onData/onExit.
export function sameDocSession(api) {
  return {
    create: (p) => api.create(p),
    write: (id, d) => api.write(id, d),
    resize: (id, c, r, x, y) => api.resize(id, c, r, x, y),
    dispose: (id) => api.dispose(id),
    onOutput: (id, cb) => {
      api.onData(id, cb);
      return () => api.offData(id, cb);
    },
    onExit: (id, cb) => {
      api.onExit(id, cb);
      return () => api.offExit(id, cb);
    },
  };
}

// Adapter for the iframe bridge terminal API (GearShell.terminal via
// gear-bridge.js): the shell pushes term.data/term.exit directly to the
// creating iframe window (workspace-terminal-bridge.js pumpOutput), so a
// local GearShell.on(...) is the whole story — no subscribe() needed.
// subscribe()/unsubscribe() toggle an unrelated pub/sub channel keyed by
// origin+topic, so we must NOT call them: an unsubscribe for one terminal
// would tear down that shared channel for every other open terminal on the
// page. Each mount gets its own on/off pair, which keeps multi-terminal
// pages (bbtex-iframe) safe.
export function iframeSession(GearShell) {
  return {
    create: (p) => GearShell.terminal.create(p),
    write: (id, d) => GearShell.terminal.write(id, d),
    resize: (id, c, r, x, y) => GearShell.terminal.resize(id, c, r, x, y),
    dispose: (id) => GearShell.terminal.dispose(id),
    onOutput: (id, cb) => {
      const handler = (payload) => {
        if (payload.sessionId === id) cb(payload.data);
      };
      GearShell.on("term.data", handler);
      return () => GearShell.off("term.data", handler);
    },
    onExit: (id, cb) => {
      const handler = (payload) => {
        if (payload.sessionId === id) cb(payload);
      };
      GearShell.on("term.exit", handler);
      return () => GearShell.off("term.exit", handler);
    },
  };
}
