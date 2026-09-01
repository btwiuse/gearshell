const hotkeys = new Map();

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function eventKey(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(String(event.key || "").toLowerCase());
  return parts.join("+");
}

function validateAction(action) {
  if (!action || typeof action !== "object") throw new Error("hotkey action is required");
  if (action.method !== "panels.open") throw new Error("only panels.open is supported for hotkeys");
  if (!Array.isArray(action.args) || typeof action.args[0] !== "string") {
    throw new Error("panels.open requires a component argument");
  }
}

export function registerHotkey(spec, owner = "core") {
  const key = normalizeKey(spec?.key);
  if (!key) throw new Error("hotkey key is required");
  validateAction(spec.action);
  const id = String(spec.id || `${owner}:${key}`);
  hotkeys.set(id, { id, key, owner, action: { ...spec.action } });
  return { ok: true, id, key };
}

export function unregisterHotkey(id, owner = "core") {
  const entry = hotkeys.get(String(id));
  if (!entry) return { ok: false, error: `hotkey "${id}" not found` };
  if (entry.owner !== owner) return { ok: false, error: "hotkey belongs to another plugin" };
  hotkeys.delete(entry.id);
  return { ok: true, id: entry.id };
}

export function listHotkeys(owner) {
  return [...hotkeys.values()]
    .filter((entry) => !owner || entry.owner === owner)
    .map((entry) => ({ ...entry, action: { ...entry.action, args: [...entry.action.args] } }));
}

export function unregisterHotkeysForOwner(owner) {
  for (const [id, entry] of hotkeys) {
    if (entry.owner === owner) hotkeys.delete(id);
  }
}

export function initHotkeys(invoke) {
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const key = eventKey(event);
    const matches = [...hotkeys.values()].filter((entry) => entry.key === key);
    if (!matches.length) return;
    event.preventDefault();
    for (const entry of matches) invoke(entry.action);
  });
}
