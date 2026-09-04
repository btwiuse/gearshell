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
import { getDockviewApi } from "./app-panels-store.js";

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

const installedSessions = new WeakSet();

// Capture phase: see the event before any in-iframe handler that
// might preventDefault for its own use (still forwarded though —
// the host's hotkey pipeline is independent).
function installForSession(session) {
  if (!session) return;
  if (installedSessions.has(session)) return;
  const iframe = session.iframe;
  if (!iframe) return;
  const contentWindow = iframe.contentWindow;
  if (!contentWindow) return;
  contentWindow.addEventListener("keydown", forwardKeydown, true);
  installedSessions.add(session);
}

function syncOnce() {
  for (const session of iframeSessions.values()) {
    installForSession(session);
  }
}

// Event-driven install instead of a per-frame RAF poll: the previous
// implementation ran `syncOnce()` 60 times/second forever, which
// saturated the main thread (50 FPS idle instead of 60, ~30 % CPU on
// the loop alone). dockview's `onDidAddPanel` is the right hook —
// new iframe sessions only appear when a panel is added.
//
// Two notes on race handling:
//   1. dockview fires onDidAddPanel before the panel's React component
//      mounts the iframe DOM (panels.js's IframePanel useEffect is
//      what creates the iframe), so the very first syncOnce() can
//      race ahead of the iframe insertion. We follow the event with a
//      one-shot RAF retry — that lands on the next frame, after React
//      has committed, so the iframe is in place by then.
//   2. Panels restored from a saved workspace at boot are also covered
//      because the initial `syncOnce()` runs before the dockview api
//      events have a chance to fire.
let unsubscribe = null;
let retryHandle = 0;
let retryFrames = 0;

function scheduleRetry() {
  if (retryHandle) return;
  retryFrames = 0;
  const tick = () => {
    retryHandle = 0;
    retryFrames += 1;
    syncOnce();
    // Two follow-up ticks are enough — React + dockview both commit
    // within a frame, so the iframe is in `iframeSessions` by then.
    // Any further retries would indicate a real bug, not a race.
    if (retryFrames < 2) {
      retryHandle = requestAnimationFrame(tick);
    } else {
      retryFrames = 0;
    }
  };
  retryHandle = requestAnimationFrame(tick);
}

export function startIframeKeyForwarder() {
  if (typeof window === "undefined") return;
  if (unsubscribe) return;
  syncOnce();
  const api = getDockviewApi();
  if (!api?.onDidAddPanel) return;
  const offAdd = api.onDidAddPanel(() => {
    syncOnce();
    scheduleRetry();
  });
  const offRemove = api.onDidRemovePanel?.(() => syncOnce()) ?? null;
  unsubscribe = () => {
    offAdd?.dispose?.();
    offRemove?.dispose?.();
    if (retryHandle) cancelAnimationFrame(retryHandle);
    retryHandle = 0;
    retryFrames = 0;
    unsubscribe = null;
  };
}

export function stopIframeKeyForwarder() {
  unsubscribe?.();
  unsubscribe = null;
}