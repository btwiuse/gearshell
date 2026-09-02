// spotlight-storage.js — localStorage helpers for Spotlight's session
// state (last query + cursor position).
//
// Persists across Spotlight closings AND across page reloads, mirroring
// the UX of dedicated launchers like Alfred / Raycast: the user's
// last query + cursor carry into the next session, so a re-open is a
// one-key continuation rather than a fresh start. Storage is namespaced
// under "spotlight.v1" so a future schema change can co-exist with the
// old key.
//
// localStorage may be unavailable (private mode, quota exceeded, or
// non-browser environments); the helpers silently degrade to no-op so
// the in-memory session still works, just without cross-reload
// persistence.

const SPOTLIGHT_STORAGE_KEY = "spotlight.v1";

export function loadStoredSession() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SPOTLIGHT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      active: Number.isInteger(parsed.active) && parsed.active >= 0
        ? parsed.active
        : 0,
    };
  } catch {
    return null;
  }
}

export function saveStoredSession(query, active) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      SPOTLIGHT_STORAGE_KEY,
      JSON.stringify({ query, active }),
    );
  } catch {
    // Private mode / quota / sandboxed iframe — drop the write.
    // The session still works in-memory for the current page.
  }
}