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
//     onProgressDone: () => {},                          // fired when the agent finishes a turn (before the chime)
//     exitMessage: "\x1b[33m[Process exited]\x1b[0m",      // line on exit; false to skip
//   });

import { loadXtermBundle, applyXtermAddons } from "./xterm-bundle.mjs";

let bundlePromise = null;
function bundle() {
  if (!bundlePromise) bundlePromise = loadXtermBundle();
  return bundlePromise;
}

// Play a short Web Audio chime in the current document context. Used as
// the default onProgressDone response (state 0 from OSC 9;4 = agent
// finished its turn). terminal-mount.mjs runs in both the host page and
// iframe plugin documents, so each AudioContext belongs to whichever
// document mounted the terminal — no cross-document API needed.
const CHIME_AUTOPLAY_UNLOCK = "gearshell.chime.unlocked.v1";
let chimeAudioCtx = null;
function ensureChimeAudioContext() {
  if (chimeAudioCtx || typeof window === "undefined") return chimeAudioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  chimeAudioCtx = new Ctor();
  return chimeAudioCtx;
}
function chimeLoadUnlocked() {
  if (typeof localStorage === "undefined") return false;
  try { return localStorage.getItem(CHIME_AUTOPLAY_UNLOCK) === "1"; }
  catch { return false; }
}
function chimeMarkUnlocked() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(CHIME_AUTOPLAY_UNLOCK, "1"); }
  catch {}
}
function progressDoneSoundEnabled(options) {
  if (typeof options.playSound === "boolean") return options.playSound;
  try {
    return globalThis.GearShell?.config?.getShell?.()
      ?.playProgressDoneSound !== false;
  } catch {
    return true;
  }
}

export function playChime(kind = "done") {
  const ctx = ensureChimeAudioContext();
  if (!ctx) return false;
  // Always try to resume; first call after page load may be silently
  // dropped if the user has not yet interacted with this document, but
  // resume() returns a promise that resolves on the next user gesture.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const now = ctx.currentTime;
  // "done" = ascending major third (pleasant); "attention" = sustained
  // minor second (urgent). Two short notes; successive plays restart
  // from the current context time so they do not stack.
  const notes = kind === "attention"
    ? [{ f: 440, t: now, dur: 0.18 }, { f: 415, t: now + 0.05, dur: 0.22 }]
    : [{ f: 523, t: now, dur: 0.12 }, { f: 659, t: now + 0.04, dur: 0.16 }];
  for (const { f, t, dur } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  chimeMarkUnlocked();
  return true;
}

// Hook a native `<wanix-term>` (or any element) for OSC 9;4
// progress-done notifications. The element fires a
// `wanix-term-progress-done` CustomEvent whenever the agent finishes
// a turn (wanix kernel:
// edge-detect on state 0 with a prior non-zero state). Default
// response is the same "done" chime the iframe terminal uses;
// pass `onDone` to override (e.g. for a custom UI badge).
//
// Returns a teardown function that removes the listener. Idempotent
// across calls — re-binding replaces the previous handler.
export function wireNativeProgressChime(element, options = {}) {
  if (!element) return () => {};
  const handler = options.onDone || (() => playChime("done"));
  const listener = (event) => handler(event?.detail);
  // Avoid stacking listeners across reconnects: tag the function on
  // the element so re-invocation clears the previous one.
  if (element.__wanixProgressChimeListener) {
    element.removeEventListener("wanix-term-progress-done", element.__wanixProgressChimeListener);
  }
  element.addEventListener("wanix-term-progress-done", listener);
  element.__wanixProgressChimeListener = listener;
  return () => {
    element.removeEventListener("wanix-term-progress-done", listener);
    if (element.__wanixProgressChimeListener === listener) {
      element.__wanixProgressChimeListener = null;
    }
  };
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
  // Create + resume the AudioContext while we are inside the user gesture
  // stack that drove this mount (e.g. the Launch button click). The
  // browser may still mark the context "suspended" until something
  // actually resumes it, so the explicit resume() at construction time
  // gets us out of that state immediately and playChime stays silent-
  // free on the very first agent-done tick of this session.
  {
    const ctx = ensureChimeAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
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
  // rAF wrapping: xterm reads host.offsetWidth/Height when sizing its
  // viewport, but those are stale for a frame after the observer fires
  // (e.g. just after a fullscreen toggle exits and the layout is
  // shrinking). Defer the actual fit to the next frame so the
  // measured size matches the new container.
  const refitAndResize = () => {
    requestAnimationFrame(() => {
      try {
        fit.fit();
        forwardSize();
      } catch {}
    });
  };

  // Detect OSC 9;4 state transitions on the raw output stream. We do
  // this here (rather than via a chained ProgressAddon) because some
  // xterm builds drop the second OSC 9 handler after applyXtermAddons
  // already registered one. A per-mount carry-over handles OSC
  // sequences whose terminator (\x07 BEL or \x1b\\ ST) lands in the
  // next chunk. We track the previous state so only the working → done
  // edge triggers the chime — not the indeterminate start tick or any
  // direct state=0 with no prior working signal.
  const OSC_9_4_RE = /\x1b\]9;4;(\d+)(?:;(\d+))?(?:\x07|\x1b\\)/g;
  let lastChimeState = null;
  let chimeTimer = null;
  let oscCarry = "";
  function sniffOsc(chunk) {
    const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    const haystack = oscCarry + text;
    oscCarry = "";
    OSC_9_4_RE.lastIndex = 0;
    while (true) {
      const m = OSC_9_4_RE.exec(haystack);
      if (!m) break;
      const state = Number(m[1]);
      if (state !== 0) {
        // Agent is back in a working state — cancel any pending chime
        // that was awaiting a quiet moment to fire. A new OSC 9;4;0
        // may follow and re-arm the timer.
        if (chimeTimer != null) {
          clearTimeout(chimeTimer);
          chimeTimer = null;
        }
        lastChimeState = state;
        continue;
      }
      // state === 0: arm a delayed chime. If the agent stays in state
      // 0 (truly done) the timer fires and we play. If it goes back
      // to a non-zero state, the early branch above cancels the
      // timer. A 400 ms quiet window is short enough to feel snappy
      // yet long enough to skip the per-frame 9;4;3 / 9;4;0 flapping
      // that some TUIs emit while still busy.
      if (lastChimeState !== null && lastChimeState !== 0) {
        if (chimeTimer == null) {
          chimeTimer = setTimeout(() => {
            chimeTimer = null;
            options.onProgressDone?.();
            if (progressDoneSoundEnabled(options)) playChime("done");
          }, 400);
        }
      }
      lastChimeState = 0;
    }
    // Keep any partial OSC tail so the next chunk can complete it.
    const lastEsc = haystack.lastIndexOf("\x1b");
    if (lastEsc >= 0) oscCarry = haystack.slice(lastEsc);
  }

  const offOutput = session.onOutput(sessionId, (data) => {
    sniffOsc(data);
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
    // Resize the terminal to its current container. Wrapped in a
    // closure so callers do not depend on which xterm FitAddon version
    // is loaded (older ones expose fit.fit, newer ones expose
    // proposeDimensions + term.resize). The implementation also no-throws
    // so a partially-torn-down handle does not break the caller.
    fitTerminal() {
      requestAnimationFrame(() => {
        try {
          if (typeof fit?.fit === "function") {
            fit.fit();
          } else if (typeof fit?.proposeDimensions === "function" && term?.resize) {
            const dims = fit.proposeDimensions();
            if (dims) term.resize(dims.cols || 80, dims.rows || 24);
          }
          forwardSize();
        } catch {}
      });
    },
    dispose: () => {
      observer.disconnect();
      window.removeEventListener("resize", refitAndResize);
      offOutput?.();
      offExit?.();
      if (chimeTimer != null) {
        clearTimeout(chimeTimer);
        chimeTimer = null;
      }
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
