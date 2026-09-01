// app-overlay-toggle.js — the shell-wide "toggle an overlay" channel.
//
// Overlays are ambient chrome rendered beside the dockview grid
// (plugins-overlays.js). Transient ones (the Spotlight launcher) need a
// way to be shown and hidden from outside their own React tree: a
// hotkey, a launcher button, or an agent through the workspace API.
//
// A DOM event is the whole mechanism. The hotkey dispatcher (app.js)
// emits, the overlay component listens for its own id, and neither has
// to import the other — which keeps plugin overlays decoupled from the
// shell that hosts them.

export const OVERLAY_TOGGLE_EVENT = "GearShellOverlayToggle";

// mode: "toggle" (default) | "open" | "close"
export function toggleOverlay(id, mode = "toggle") {
  if (typeof id !== "string" || !id) return { ok: false, error: "overlay id is required" };
  if (typeof window === "undefined") return { ok: false, error: "no window" };
  window.dispatchEvent(
    new CustomEvent(OVERLAY_TOGGLE_EVENT, { detail: { id, mode } }),
  );
  return { ok: true, id, mode };
}

// Subscribe to toggle requests for one overlay id. `onToggle(mode)` gets
// "toggle" / "open" / "close". Returns the unsubscribe function so
// callers can use it directly as a useEffect cleanup.
export function onOverlayToggle(id, onToggle) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => {
    if (event.detail?.id !== id) return;
    onToggle(event.detail.mode || "toggle");
  };
  window.addEventListener(OVERLAY_TOGGLE_EVENT, handler);
  return () => window.removeEventListener(OVERLAY_TOGGLE_EVENT, handler);
}
