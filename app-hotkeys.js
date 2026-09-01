const hotkeys = new Map();

// KeyboardEvent.key for the space bar is a literal " ", which the
// whitespace-stripping normalizer below would erase entirely ("ctrl+ "
// becomes "ctrl+"), so a spec can never match the event. Both sides map
// it to the "space" alias instead.
function normalizeKeyName(name) {
  return name === " " ? "space" : name;
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split("+")
    .map((part) => normalizeKeyName(part.replace(/\s+/g, "") || " "))
    .filter(Boolean)
    .join("+");
}

function eventKey(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(normalizeKeyName(String(event.key || "").toLowerCase()));
  return parts.join("+");
}

// Supported hotkey actions. `panels.open` opens a dockview panel;
// `overlay.toggle` flips a registered shell overlay (the Spotlight
// launcher), which is transient chrome and must not create a tab.
const HOTKEY_METHODS = new Set(["panels.open", "overlay.toggle"]);

function validateAction(action) {
  if (!action || typeof action !== "object") throw new Error("hotkey action is required");
  if (!HOTKEY_METHODS.has(action.method)) {
    throw new Error(
      `unsupported hotkey method "${action.method}" (expected one of: ${
        [...HOTKEY_METHODS].join(", ")
      })`,
    );
  }
  if (!Array.isArray(action.args) || typeof action.args[0] !== "string") {
    throw new Error(`${action.method} requires a string argument`);
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
    if (matches.some((entry) => entry.action.method === "panels.open" && entry.action.args[0] === "launcher")) {
      requestAnimationFrame(() => window.dispatchEvent(new Event("GearShellPanelFocused")));
    }
  });
}
