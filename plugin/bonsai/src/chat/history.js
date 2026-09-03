// Persist and restore Bonsai chat sessions. Each session is the
// assistant's `messages` array plus a small index entry. Bodies live
// under `bonsai_chat_session_v1:<id>`; a single `bonsai_chat_sessions_v1`
// index keeps titles, timestamps, and byte sizes for fast rendering of
// the history panel.
const HISTORY_INDEX_KEY = "bonsai_chat_sessions_v1";
const HISTORY_BODY_PREFIX = "bonsai_chat_session_v1:";
const MAX_HISTORY_BYTES = 12 * 1024 * 1024;

export function makeSessionId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function trimMessages(messages) {
  let total = 0;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const chunk = (m.content?.length ?? 0) + (m.name?.length ?? 0);
    if (total + chunk > MAX_HISTORY_BYTES) break;
    out.push(m);
    total += chunk;
  }
  return out.reverse();
}

export function readSessionIndex() {
  try {
    const raw = localStorage.getItem(HISTORY_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function writeSessionIndex(index) {
  try { localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(index)); } catch {}
}

function pruneIndexByQuota(index) {
  let total = index.reduce((acc, s) => acc + (s.bytes ?? 0), 0);
  while (total > MAX_HISTORY_BYTES && index.length > 1) {
    const dropped = index.pop();
    total -= dropped?.bytes ?? 0;
    if (dropped) try { localStorage.removeItem(HISTORY_BODY_PREFIX + dropped.id); } catch {}
  }
  return index;
}

export function upsertSessionIndex(entry) {
  const index = readSessionIndex().filter((s) => s.id !== entry.id);
  index.unshift(entry);
  writeSessionIndex(pruneIndexByQuota(index));
}

export function removeSession(id) {
  if (!id) return;
  const index = readSessionIndex().filter((s) => s.id !== id);
  writeSessionIndex(index);
  try { localStorage.removeItem(HISTORY_BODY_PREFIX + id); } catch {}
}

export function loadSession(id) {
  try {
    const raw = localStorage.getItem(HISTORY_BODY_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function persistSession({ id, title, messages }) {
  if (!id) return;
  const trimmed = trimMessages(messages);
  if (trimmed.length === 0) return;
  const body = JSON.stringify({
    id,
    title: title || "Untitled chat",
    updatedAt: Date.now(),
    messages: trimmed,
  });
  try {
    localStorage.setItem(HISTORY_BODY_PREFIX + id, body);
  } catch (error) {
    if (error?.name !== "QuotaExceededError") return;
    pruneIndexByQuota(readSessionIndex());
    try { localStorage.setItem(HISTORY_BODY_PREFIX + id, body); } catch {}
  }
  upsertSessionIndex({
    id,
    title: title || "Untitled chat",
    updatedAt: Date.now(),
    preview: trimmed[trimmed.length - 1]?.content?.slice(0, 80) ?? "",
    bytes: body.length,
  });
}
