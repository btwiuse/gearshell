// spotlight-overlay.js — the Spotlight launcher as a shell overlay
// (component plugin — no iframe).
//
// Lives in the same plugin shell position the iframe edition used: an
// ambient overlay mounted next to the dockview grid, never spending a
// tab. The toggle channel ("overlay.toggle" with id "spotlight") still
// drives mount/unmount, and the close affordance (Escape, backdrop
// click, picking a result) is owned by this component. No bridge, no
// postMessage roundtrip — every keystroke talks to ctx.api directly,
// and the overlay mounts/unmounts in the same React tree as the rest of
// the shell.
//
// Two result kinds are merged into one list:
//   - "app": an installed plugin / panel type -> ctx.api.panels.open(component)
//   - "panel": an already-open dockview panel -> ctx.api.panels.focus(id)
// Apps the user pinned in the launcher config sort first, exactly like
// the launcher card's pinned-first ordering.
//
// Icons resolve through lucide-react (already bundled in the shell)
// keyed by the manifest's icon name, exactly the same shape
// plugins-cards.iconOf uses: truthiness check + Wrench fallback.
// lucide-react exports icons as forwardRef objects (not plain
// functions), so the truthiness check is the only safe discriminator
// — `typeof === "function"` always returns false and breaks every
// real icon.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import htm from "htm";
import { icons as LucideIcons } from "lucide-react";
import { onOverlayToggle } from "../../app-overlay-toggle.js";
import { loadStoredSession, saveStoredSession } from "./spotlight-storage.js";

const html = htm.bind(React.createElement);

export const SPOTLIGHT_OVERLAY_ID = "spotlight";

// Panel types that exist in the shell but are not installable plugins:
// the launcher's own fallback card, the terminal, and the built-in
// Plugins manager (a dockview built-in, not a plugin). Terminal +
// Plugins deserve to be in Spotlight regardless of whether the user
// has them pinned, because they're the two most-launched built-ins
// alongside a keyboard-first launcher.
const EXTRA_APPS = [
  { component: "console", name: "Console", iconName: "Terminal" },
  { component: "launcher", name: "Launcher", iconName: "Rocket" },
  { component: "plugins", name: "Plugins", iconName: "Puzzle" },
];

// Mount state driven by the toggle channel ("toggle" | "open" | "close").
function useSpotlightVisibility() {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onOverlayToggle(SPOTLIGHT_OVERLAY_ID, (mode) => {
        if (mode === "open") return setOpen(true);
        if (mode === "close") return setOpen(false);
        setOpen((previous) => !previous);
      }),
    [],
  );
  return [open, setOpen];
}

function RowIcon({ item }) {
  // Mirrors plugins-cards.iconOf exactly: truthiness check, Wrench as
  // the missing-icon fallback. Plugin manifests ship lucide names, so
  // every enabled plugin has a real icon in the catalog.
  const Icon = LucideIcons[item.iconName] || LucideIcons.Wrench;
  return html`
    <span className="sl-row-icon" aria-hidden=${true}>
      <${Icon} size=${14}/>
    </span>
  `;
}

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

function pluginApps(plugins) {
  return plugins
    .filter((plugin) => plugin && plugin.enabled !== false && plugin.id)
    // Tool-only plugins (wasm/preset, no UI) have no panel to open.
    .filter((plugin) => plugin.entry || plugin.iframe)
    .map((plugin) => ({
      kind: "app",
      component: plugin.id,
      name: plugin.name || plugin.id,
      iconName: typeof plugin.icon === "string" ? plugin.icon : null,
    }));
}

function dedupeApps(apps) {
  const seen = new Set();
  return apps.filter((app) => {
    const key = app.kind === "preset"
      ? `preset:${app.preset.id}`
      : `app:${app.component}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function consolePresetApps(shell) {
  return (shell.terminalProfiles || [])
    .filter((profile) => profile && profile.builtin !== true && profile.id)
    .map((profile) => ({
      kind: "preset",
      component: "console",
      name: `Console · ${profile.name || profile.id}`,
      iconName: typeof profile.icon === "string" ? profile.icon : "Terminal",
      preset: profile,
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

// Load shell config + installed plugins + open panels whenever the
// overlay opens. A re-open after the user has installed new apps picks
// them up; the cost is one Promise.all against ctx.api. Returns null
// while loading so the UI can show the empty state, otherwise the
// resolved { apps, panels } shape the caller merges and sorts.
function useSpotlightCatalog(open, api) {
  const [catalog, setCatalog] = useState({ apps: [], panels: [] });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open || !api) return undefined;
    let stopped = false;
    setError(null);
    Promise.all([
      api.config.getShell(),
      api.config.plugins.list(),
      api.panels.list(),
    ]).then(
      ([shell, plugins, panels]) => {
        if (stopped) return;
        const apps = dedupeApps([
          ...pluginApps(Array.isArray(plugins) ? plugins : []),
          ...EXTRA_APPS.map((app) => ({ ...app, kind: "app" })),
          ...consolePresetApps(shell || {}),
        ]);
        setCatalog({
          apps: sortApps(apps, shell || {}),
          panels: (Array.isArray(panels) ? panels : []).map((panel) => ({
            kind: "panel",
            id: panel.id,
            name: panel.title || panel.component || panel.id,
            component: panel.component,
          })),
        });
      },
      (failure) => {
        if (stopped) return;
        setError(failure?.message || String(failure));
      },
    );
    return () => {
      stopped = true;
    };
  }, [open, api]);
  return { catalog, error };
}

function SpotlightSearch({ query, onChange, onKeyDown, inputRef }) {
  return html`
    <div className="sl-search">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
      </svg>
      <input
        ref=${inputRef}
        type="text"
        placeholder="Search apps and panels…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Search"
        value=${query}
        onInput=${(event) => onChange(event.target.value)}
        onKeyDown=${onKeyDown}
      />
      <span className="sl-hint">esc</span>
    </div>
  `;
}

function SpotlightRow({ item, index, active, onActivate, onLaunch }) {
  const isActive = index === active;
  return html`
    <button
      type="button"
      className=${isActive ? "sl-row is-active" : "sl-row"}
      onMouseEnter=${() => onActivate(index)}
      onClick=${() => onLaunch(index)}
    >
      <${RowIcon} item=${item}/>
      <span className="sl-row-text">
        <span className="sl-row-title">${item.name}</span>
        ${item.kind === "panel" && html`
          <span className="sl-row-sub">Switch to open panel</span>
        `}
      </span>
      ${item.pinned && html`
        <span className="sl-row-pin" title="Pinned">★</span>
      `}
    </button>
  `;
}

function SpotlightResults({ results, active, query, error, onActivate, onLaunch }) {
  if (error) {
    return html`<p className="sl-error">${error}</p>`;
  }
  if (results.length === 0) {
    return html`
      <p className="sl-empty">
        ${query ? `No matches for "${query}"` : "No apps available"}
      </p>
    `;
  }
  return results.map((item, index) => {
    const showGroup = index === 0 || item.kind !== results[index - 1].kind;
    const groupLabel = item.kind === "panel" ? "Open panels" : "Applications";
    return html`
      <${React.Fragment} key=${`${item.kind}:${item.id || item.component}`}>
        ${showGroup && html`
          <div className="sl-group-label">${groupLabel}</div>
        `}
        <${SpotlightRow}
          item=${item}
          index=${index}
          active=${active}
          onActivate=${onActivate}
          onLaunch=${onLaunch}
        />
      </${React.Fragment}>
    `;
  });
}

// Owns the spotlight "session" — query string + cursor (active row).
// Initial state reads from localStorage so the first open after a
// reload picks up where the user left off. Subsequent updates write
// through (one JSON.stringify per keystroke, in the React commit
// phase) so the next open can resume.
//
// The session is NOT reset on every open. The catalog hook reloads
// when the overlay re-opens, and useSpotlightResults clamps the
// active row when the list shape changes (filters, plugin
// install/remove), so stale state never points at a missing row.
function useSpotlightSession() {
  const [query, setQuery] = useState(() => loadStoredSession()?.query ?? "");
  const [active, setActive] = useState(() => loadStoredSession()?.active ?? 0);
  useEffect(() => {
    saveStoredSession(query, active);
  }, [query, active]);
  return { query, setQuery, active, setActive };
}

// Filter apps + panels by the trimmed search. Apps always show;
// panels only join the list when the user has typed something (a
// "switch to" affordance, not a default clutter).
function useSpotlightResults(catalog, query) {
  const trimmed = query.trim().toLowerCase();
  return useMemo(() => {
    const apps = matchItems(catalog.apps, trimmed);
    const panels = trimmed ? matchItems(catalog.panels, trimmed) : [];
    return [...apps, ...panels];
  }, [catalog.apps, catalog.panels, trimmed]);
}

// Launch the picked result: close the overlay first so the newly
// focused panel is not left behind a dead backdrop if the call is
// slow; then route panels vs apps to the right ctx.api method.
function useSpotlightLaunch({ results, close, api }) {
  return useCallback(
    async (index) => {
      const item = results[index];
      if (!item) return;
      close();
      try {
        if (item.kind === "panel") {
          await api.panels.focus(item.id);
          return;
        }
        await api.panels.open(item.component, item.kind === "preset"
          ? { profile: item.preset }
          : undefined);
      } catch (failure) {
        console.warn("spotlight: launch failed", failure);
      }
    },
    [results, close, api],
  );
}

// Keyboard handler bound to the search input: Escape closes, the
// arrows move the active row (wrapping), Enter launches the active
// row. preventDefault stops the host from scrolling on arrows.
function useSpotlightKeyDown({ results, active, launch, close, moveActive }) {
  return useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (results.length > 0) moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (results.length > 0) moveActive(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        launch(active);
      }
    },
    [results.length, active, launch, close, moveActive],
  );
}

// Pure presentational surface for SpotlightOverlay. All hooks stay in
// the parent; this component is the JSX tree and the backdrop close
// affordance, so the parent's only job is wiring data through it.
function SpotlightCard({
  query,
  setQuery,
  onKeyDown,
  inputRef,
  results,
  active,
  error,
  setActive,
  launch,
  closeSpotlight,
}) {
  // Treat any click on the surrounding glass the same as Escape:
  // close the overlay and let it bubble up so dockview's normal
  // pointer behaviour isn't preempted by an inert full-viewport
  // overlay element. Only the card itself is a real click target.
  const onGlassMouseDown = (event) => {
    if (event.target === event.currentTarget) closeSpotlight();
  };
  return html`
    <div
      className="spotlight-glass"
      onMouseDown=${onGlassMouseDown}
      role="presentation"
    >
      <div className="spotlight-card" role="dialog" aria-modal="true" aria-label="Spotlight">
        <${SpotlightSearch}
          query=${query}
          onChange=${setQuery}
          onKeyDown=${onKeyDown}
          inputRef=${inputRef}
        />
        <div className="sl-results">
          <${SpotlightResults}
            results=${results}
            active=${active}
            query=${query}
            error=${error}
            onActivate=${setActive}
            onLaunch=${launch}
          />
        </div>
      </div>
    </div>
  `;
}

// Focus the input element on the next frame after the overlay opens,
// so the user can type without clicking first. The ref is read inside
// the rAF callback to avoid racing the JSX commit.
function useSpotlightAutoFocus(open, inputRef) {
  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, inputRef]);
}

export function SpotlightOverlay({ api }) {
  const [open, setOpen] = useSpotlightVisibility();
  const { query, setQuery, active, setActive } = useSpotlightSession();
  const { catalog, error } = useSpotlightCatalog(open, api);
  const closeSpotlight = useCallback(() => setOpen(false), [setOpen]);
  const inputRef = useRef(null);
  const results = useSpotlightResults(catalog, query);

  useSpotlightAutoFocus(open, inputRef);

  // Keep active inside [0, results.length) when the list shape
  // changes (filter narrowed, panels section toggled, etc.).
  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active, setActive]);

  const moveActive = useCallback((delta) => {
    if (results.length === 0) return;
    setActive((current) =>
      (current + delta + results.length) % results.length,
    );
  }, [results.length, setActive]);

  const launch = useSpotlightLaunch({ results, close: closeSpotlight, api });
  const onKeyDown = useSpotlightKeyDown({
    results,
    active,
    launch,
    close: closeSpotlight,
    moveActive,
  });

  if (!open) return null;

  return html`
    <${SpotlightCard}
      query=${query}
      setQuery=${setQuery}
      onKeyDown=${onKeyDown}
      inputRef=${inputRef}
      results=${results}
      active=${active}
      error=${error}
      setActive=${setActive}
      launch=${launch}
      closeSpotlight=${closeSpotlight}
    />
  `;
}