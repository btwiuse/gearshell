// app-iframe-key-forwarder.js — bridge keydown events from iframe
// panels back to the shell window.
//
// Iframe plugins (Browser, Bonsai, glmatrix, Codigo, ...) load a
// remote page inside a dockview panel. Keyboard events fired inside
// the iframe's contentWindow do not naturally cross the security
// boundary to the host window, so any hotkey bound at the shell level
// (Spotlight, plugins page nav, the core launcher shortcut) silently
// stops working while focus is inside such a panel. This is most
// obvious with full-screen canvas/WebGL panels like Digital Rain,
// where the canvas captures keydown and never bubbles out.
//
// The forwarder installs a capture-phase keydown listener on every
// active iframe session's contentWindow and re-dispatches the event
// to the shell's window. The shell's normal hotkey pipeline then sees
// it and acts. The original event in the iframe is left alone, so
// the inner page can still react to typing (e.g. a text input inside
// the iframe).
//
// One listener per iframe session, installed lazily when the session
// becomes visible and torn down when the session goes away. We avoid
// touching iframes that are not currently in the dockview layout
// (no `anchor`) to keep memory + handler cost proportional to visible
// panels.

import { iframeSessions } from "./app-state.js";

const installedSessions = new WeakSet();
let pollHandle = 0;

// Re-dispatch a keydown event to the shell window. Synthesizing the
// event lets the shell's existing hotkey pipeline match it through
// the same key normalization path used for native keydowns.
function forwardKeydown(hostEvent) {
  if (hostEvent.defaultPrevented) return;
  if (hostEvent.isComposing) return;
  // Only forward when modifier keys are held — bare typing is owned by
  // the iframe; the host only cares about hotkeys.
  if (!hostEvent.ctrlKey && !hostEvent.metaKey && !hostEvent.altKey) {
    return;
  }
  const synthesized = new KeyboardEvent("keydown", {
    key: hostEvent.key,
    code: hostEvent.code,
    keyCode: hostEvent.keyCode,
    which: hostEvent.which,
    ctrlKey: hostEvent.ctrlKey,
    shiftKey: hostEvent.shiftKey,
    altKey: hostEvent.altKey,
    metaKey: hostEvent.metaKey,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(synthesized);
}

function installForSession(session) {
  const iframe = session.iframe;
  if (!iframe) return;
  const contentWindow = iframe.contentWindow;
  if (!contentWindow) return;
  if (installedSessions.has(session)) return;
  // Capture phase: see the event before any in-iframe handler that
  // might preventDefault for its own use (still forwarded though —
  // the host's hotkey pipeline is independent).
  contentWindow.addEventListener("keydown", forwardKeydown, true);
  installedSessions.add(session);
}

// Poll-based install: iframeSessions grows as panels open and the
// <iframe> elements appear in the DOM. We can't subscribe to "new
// iframe" cleanly without changing app-sessions.js, so a cheap RAF
// poll keeps the listener set in sync. Cost is one Map iteration per
// frame regardless of size, so this scales linearly with iframe count.
function syncOnce() {
  for (const session of iframeSessions.values()) {
    installForSession(session);
  }
}

export function startIframeKeyForwarder() {
  if (typeof window === "undefined") return;
  if (pollHandle) return;
  const loop = () => {
    syncOnce();
    pollHandle = requestAnimationFrame(loop);
  };
  pollHandle = requestAnimationFrame(loop);
}

export function stopIframeKeyForwarder() {
  if (pollHandle) cancelAnimationFrame(pollHandle);
  pollHandle = 0;
}