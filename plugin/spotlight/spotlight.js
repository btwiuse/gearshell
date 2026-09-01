// spotlight.js — the Spotlight launcher page logic (iframe side).
//
// Runs inside the overlay iframe that spotlight-plugin.js mounts. Talks
// to the shell only through the gear-bridge proxy (window.GearShell),
// which is async and gated by the manifest's permissions.api whitelist.
//
// Two result kinds are merged into one list:
//   - "app": an installed plugin / panel type -> panels.open(component)
//   - "panel": an already-open dockview panel -> panels.focus(id)
// Apps the user pinned in the launcher config sort first, exactly like
// the launcher card's pinned-first ordering.
//
// Closing is the shell's job: this page posts { spotlight: "close" } to
// the parent, which unmounts the overlay (so the iframe is never left
// invisible-but-alive swallowing clicks).

"use strict";

const CLOSE_MESSAGE = { spotlight: "close" };

// Panel types that exist in the shell but are not installable plugins:
// the launcher's own fallback card and the terminal. Terminal is worth
// offering because it is the single most launched thing.
const EXTRA_APPS = [
  { component: "terminal", name: "Terminal" },
  { component: "launcher", name: "Launcher" },
];

const state = {
  apps: [],
  panels: [],
  results: [],
  active: 0,
  query: "",
};

const el = {
  card: document.getElementById("sl-card"),
  input: document.getElementById("sl-input"),
  results: document.getElementById("sl-results"),
};

function closeSpotlight() {
  try {
    window.parent.postMessage(CLOSE_MESSAGE, "*");
  } catch {
    // The shell is gone; nothing to close.
  }
}

// --- Catalog ---------------------------------------------------------

// Two-letter monogram stands in for the shell's lucide icons: icon
// components cannot cross postMessage, and pulling a font/sprite sheet
// into the iframe for this would be a heavier dependency than it earns.
function monogram(name) {
  const words = String(name || "?").trim().split(/[\s-_]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function pluginApps(plugins) {
  return plugins
    .filter((plugin) => plugin && plugin.enabled !== false && plugin.id)
    // Tool-only plugins (wasm/preset, no UI) have no panel to open.
    .filter((plugin) => plugin.entry || plugin.iframe)
    .map((plugin) => ({
      kind: "app",
      component: plugin.id,
      name: plugin.name || plugin.id,
    }));
}

// Pinned first, then the launcher's configured order, then the rest.
function sortApps(apps, shell) {
  const pinned = new Set(shell.pinnedLauncherItems || []);
  const order = shell.launcherOrder || [];
  const rank = (app) => {
    const index = order.indexOf(app.component);
    return index === -1 ? order.length : index;
  };
  return apps
    .map((app) => ({ ...app, pinned: pinned.has(app.component) }))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      const byOrder = rank(left) - rank(right);
      if (byOrder !== 0) return byOrder;
      return left.name.localeCompare(right.name);
    });
}

function dedupeApps(apps) {
  const seen = new Set();
  return apps.filter((app) => {
    if (seen.has(app.component)) return false;
    seen.add(app.component);
    return true;
  });
}

async function loadCatalog() {
  const [shell, plugins, panels] = await Promise.all([
    window.GearShell.config.getShell(),
    window.GearShell.config.plugins.list(),
    window.GearShell.panels.list(),
  ]);
  const apps = dedupeApps([
    ...pluginApps(Array.isArray(plugins) ? plugins : []),
    ...EXTRA_APPS.map((app) => ({ ...app, kind: "app" })),
  ]);
  state.apps = sortApps(apps, shell || {});
  state.panels = (Array.isArray(panels) ? panels : []).map((panel) => ({
    kind: "panel",
    id: panel.id,
    name: panel.title || panel.component || panel.id,
    component: panel.component,
  }));
}

// --- Filtering -------------------------------------------------------

// Subsequence match ("plg" hits "Playground") with a score that favours
// prefix and word-boundary hits, so short queries rank the obvious app
// first instead of whatever happens to sort earliest.
function fuzzyScore(text, query) {
  const haystack = text.toLowerCase();
  if (!query) return 0;
  if (haystack.startsWith(query)) return 1000;
  const direct = haystack.indexOf(query);
  if (direct > 0) return 600 - direct;
  let score = 0;
  let cursor = 0;
  for (const char of query) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return -1;
    score += found === 0 || /[\s-_]/.test(haystack[found - 1] || "") ? 12 : 4;
    cursor = found + 1;
  }
  return score;
}

function matchItems(items, query) {
  if (!query) return items;
  return items
    .map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(item.name, query),
        fuzzyScore(item.component || "", query),
      ),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

function computeResults() {
  const query = state.query.trim().toLowerCase();
  const apps = matchItems(state.apps, query);
  // Open panels are a "switch to" affordance: only worth showing when
  // the user is actually searching, otherwise they double every app.
  const panels = query ? matchItems(state.panels, query) : [];
  state.results = [...apps, ...panels];
  state.active = 0;
}

// --- Rendering -------------------------------------------------------

function rowNode(item, index) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = index === state.active ? "sl-row is-active" : "sl-row";
  row.dataset.index = String(index);

  const icon = document.createElement("span");
  icon.className = "sl-row-icon";
  icon.textContent = monogram(item.name);
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "sl-row-text";
  const title = document.createElement("span");
  title.className = "sl-row-title";
  title.textContent = item.name;
  text.appendChild(title);
  if (item.kind === "panel") {
    const sub = document.createElement("span");
    sub.className = "sl-row-sub";
    sub.textContent = "Switch to open panel";
    text.appendChild(document.createElement("br"));
    text.appendChild(sub);
  }

  row.append(icon, text);
  if (item.pinned) {
    const pin = document.createElement("span");
    pin.className = "sl-row-pin";
    pin.textContent = "★";
    pin.title = "Pinned";
    row.appendChild(pin);
  }
  row.addEventListener("click", () => launch(index));
  return row;
}

function groupLabel(text) {
  const label = document.createElement("div");
  label.className = "sl-group-label";
  label.textContent = text;
  return label;
}

function render() {
  el.results.textContent = "";
  if (state.results.length === 0) {
    const empty = document.createElement("p");
    empty.className = "sl-empty";
    empty.textContent = state.query
      ? `No matches for "${state.query}"`
      : "No apps available";
    el.results.appendChild(empty);
    return;
  }
  let lastKind = null;
  state.results.forEach((item, index) => {
    if (item.kind !== lastKind) {
      el.results.appendChild(
        groupLabel(item.kind === "panel" ? "Open panels" : "Applications"),
      );
      lastKind = item.kind;
    }
    el.results.appendChild(rowNode(item, index));
  });
  scrollActiveIntoView();
}

function scrollActiveIntoView() {
  const active = el.results.querySelector(".sl-row.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

// --- Actions ---------------------------------------------------------

async function launch(index) {
  const item = state.results[index];
  if (!item) return;
  // Close first: the shell unmounts the overlay, so the newly focused
  // panel is not left behind a dead backdrop if the call is slow.
  closeSpotlight();
  try {
    if (item.kind === "panel") {
      await window.GearShell.panels.focus(item.id);
      return;
    }
    await window.GearShell.panels.open(item.component);
  } catch (error) {
    console.warn("spotlight: launch failed", error);
  }
}

function moveActive(delta) {
  if (state.results.length === 0) return;
  const next = (state.active + delta + state.results.length) %
    state.results.length;
  state.active = next;
  render();
}

// --- Wiring ----------------------------------------------------------

function onKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSpotlight();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    launch(state.active);
  }
}

function showError(message) {
  el.results.textContent = "";
  const error = document.createElement("p");
  error.className = "sl-error";
  error.textContent = message;
  el.results.appendChild(error);
}

function wire() {
  el.input.addEventListener("input", () => {
    state.query = el.input.value;
    computeResults();
    render();
  });
  window.addEventListener("keydown", onKeyDown);
  // The shell re-focuses the input each time it re-opens the overlay.
  window.addEventListener("message", (event) => {
    if (event.data?.spotlight !== "focus") return;
    el.input.value = "";
    state.query = "";
    computeResults();
    render();
    el.input.focus();
  });
}

async function main() {
  if (!window.GearShell) {
    showError("gear-bridge.js did not load — Spotlight needs the shell bridge.");
    return;
  }
  wire();
  el.input.focus();
  try {
    await loadCatalog();
  } catch (error) {
    showError(`Could not load the app catalog: ${error.message}`);
    return;
  }
  computeResults();
  render();
}

main();
