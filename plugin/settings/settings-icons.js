// Terminal preset icon picker: a Lucide catalog browser.

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { settingsDep } from "./settings-deps.js";
import htm from "htm";

const html = htm.bind(React.createElement);
// === Terminal preset icon picker ===
// `TerminalPresetIconPicker` is a 300+-icon Lucide catalog browser
// used by the terminal preset editor's icon field. It uses the
// shared TERMINAL_PRESET_ICON_BY_ID / TERMINAL_PRESET_ICON_OPTIONS
// tables (passed through the dep shim so settings.js doesn't reach
// into the global app state directly) and renders a paginated grid
// of icon buttons + a search box.

const RECENT_KEY = "crush-runner-recent-icons";
const RECENT_LIMIT = 8;

const ICON_CATEGORIES = [
  { id: "all", label: "All", match: () => true },
  {
    id: "agents",
    label: "Agents",
    match: (id) =>
      /^(bot|sparkles|message-circle|message-square|wand|wand-sparkles|atom|mic|lightbulb|workflow|zap)/i
        .test(id),
  },
  {
    id: "terminal",
    label: "Terminal",
    match: (id) =>
      /^(terminal|square-terminal|code|code-2|braces|brackets|command|hash|chevron-right)/i
        .test(id),
  },
  {
    id: "tools",
    label: "Tools",
    match: (id) =>
      /^(wrench|screwdriver|hammer|settings|gear|tool|pencil|pen|brush|scissors|package|box|boxes|cog)/i
        .test(id),
  },
  {
    id: "media",
    label: "Media",
    match: (id) =>
      /^(image|music|video|film|camera|microphone|headphones|volume|play|pause|fast-forward|rewind)/i
        .test(id),
  },
  {
    id: "shapes",
    label: "Shapes",
    match: (id) =>
      /^(circle|square|triangle|hexagon|octagon|star|heart|diamond|polygon)/i
        .test(id),
  },
];

function readRecentIcons(iconById) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id) => iconById[id]).slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function saveRecentIcons(next) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
}

// Loose token match: every char of the query appears in order somewhere
// in the haystack. Lets "bt" find "bot" without exact substring luck.
function matchesIconQuery(query, option) {
  if (!query) return true;
  const haystack = `${option.label} ${option.id}`.toLocaleLowerCase();
  if (haystack.includes(query)) return true;
  let cursor = 0;
  for (const char of query) {
    const next = haystack.indexOf(char, cursor);
    if (next === -1) return false;
    cursor = next + 1;
  }
  return true;
}

function renderIconTrigger({ open, selected, setOpen }) {
  const SelectedIcon = selected.icon;
  return html`
    <button
      type="button"
      className="terminal-profile-icon-trigger"
      aria-expanded=${open}
      aria-controls="terminal-preset-icon-catalog"
      onClick=${() => setOpen((visible) => !visible)}
    >
      <${SelectedIcon} size=${18} aria-hidden=${true}/>
      <span className="terminal-profile-icon-trigger-label">${selected.label}</span>
      <${ChevronDown}
        size=${16}
        aria-hidden=${true}
        style=${open ? { transform: "rotate(180deg)" } : undefined}
      />
    </button>
  `;
}

function renderCatalogToolbar({ query, setQuery, count, total }) {
  return html`
    <div className="terminal-profile-icon-catalog-toolbar">
      <input
        type="search"
        value=${query}
        placeholder=${`Search ${total} icons…`}
        aria-label="Search icons"
        autoComplete="off"
        autoFocus=${true}
        onChange=${(event) => setQuery(event.target.value)}
      />
      <span className="terminal-profile-icon-result-count">${count}${count === 1 ? " icon" : " icons"}</span>
    </div>
  `;
}

function renderCategories({ categories, category, setCategory }) {
  return html`
    <div className="terminal-profile-icon-categories" role="tablist">
      ${categories.map((c) =>
        html`<button
          key=${c.id}
          type="button"
          role="tab"
          aria-selected=${category === c.id}
          className=${`terminal-profile-icon-category${
            category === c.id ? " selected" : ""
          }`}
          onClick=${() => setCategory(c.id)}
        >${c.label}</button>`,
      )}
    </div>
  `;
}

function renderIconOption({ option, value, choose, size, showLabel }) {
  const Icon = option.icon;
  const isSelected = value === option.id;
  return html`
    <button
      key=${option.id}
      type="button"
      className=${`terminal-profile-icon-option${isSelected ? " selected" : ""}`}
      data-icon-id=${option.id}
      data-selected=${isSelected}
      title=${option.label}
      aria-label=${option.label}
      aria-pressed=${isSelected}
      onClick=${() => choose(option.id)}
    >
      <${Icon} size=${size} aria-hidden=${true}/>
      ${showLabel ? html`<span>${option.label}</span>` : null}
    </button>
  `;
}

function renderRecentGrid({ recents, value, choose }) {
  return recents.length > 0 &&
    html`
      <div className="terminal-profile-icon-recent">
        <span className="terminal-profile-icon-section-label">Recent</span>
        <div className="terminal-profile-icon-recent-grid">
          ${recents.map((option) =>
            renderIconOption({ option, value, choose, size: 22, showLabel: false }),
          )}
        </div>
      </div>
    `;
}

function renderResultsGrid({ filtered, value, choose, gridRef }) {
  return filtered.length > 0
    ? html`
      <div
        ref=${gridRef}
        className="terminal-profile-icon-grid"
        role="group"
        aria-label="Icon results"
      >
        ${filtered.map((option) =>
          renderIconOption({ option, value, choose, size: 26, showLabel: true }),
        )}
      </div>
    `
    : html`
      <p className="terminal-profile-icon-empty">No icons match. Try fewer letters or a different category.</p>
    `;
}

function handleCatalogKeyDown({ event, gridRef, onChange, choose }) {
  if (
    event.key !== "ArrowRight" && event.key !== "ArrowLeft" &&
    event.key !== "ArrowDown" && event.key !== "ArrowUp" &&
    event.key !== "Enter" && event.key !== " "
  ) return;
  event.preventDefault();
  const tiles = gridRef.current
    ? Array.from(
      gridRef.current.querySelectorAll(".terminal-profile-icon-option"),
    )
    : [];
  if (tiles.length === 0) return;
  const currentIndex = tiles.findIndex((tile) =>
    tile.dataset.selected === "true"
  );
  let target = currentIndex;
  if (event.key === "Enter" || event.key === " ") {
    const id = tiles[currentIndex >= 0 ? currentIndex : 0]?.dataset.iconId;
    if (id) choose(id);
    return;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    target = currentIndex + 1;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    target = currentIndex - 1;
  }
  if (target < 0) target = tiles.length - 1;
  if (target >= tiles.length) target = 0;
  const nextId = tiles[target]?.dataset.iconId;
  if (nextId) onChange(nextId);
}

function renderCatalog({
  open,
  catalogRef,
  query,
  setQuery,
  filtered,
  total,
  category,
  setCategory,
  recentOptions,
  value,
  choose,
  gridRef,
}) {
  return open && html`
    <div
      ref=${catalogRef}
      id="terminal-preset-icon-catalog"
      className="terminal-profile-icon-catalog"
    >
      ${renderCatalogToolbar({ query, setQuery, count: filtered.length, total })}
      ${renderCategories({ categories: ICON_CATEGORIES, category, setCategory })}
      ${renderRecentGrid({ recents: recentOptions, value, choose })}
      ${renderResultsGrid({ filtered, value, choose, gridRef })}
      <div className="terminal-profile-icon-footer">
        <span>↑↓←→ to browse · Enter to apply · Esc to close</span>
      </div>
    </div>
  `;
}

function makeIconChooser({ onChange, setRecents, setOpen }) {
  return (optionId) => {
    onChange(optionId);
    setRecents((current) => {
      const next = [optionId, ...current.filter((id) => id !== optionId)].slice(
        0,
        RECENT_LIMIT,
      );
      saveRecentIcons(next);
      return next;
    });
    setOpen(false);
  };
}

function makePickerKeyHandler({ open, setOpen, gridRef, onChange, choose }) {
  return (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    handleCatalogKeyDown({ event, gridRef, onChange, choose });
  };
}

function scrollSelectedTile(gridRef) {
  if (!gridRef.current) return;
  const tile = gridRef.current.querySelector('[data-selected="true"]');
  if (tile && typeof tile.scrollIntoView === "function") {
    tile.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function useIconPickerInteraction(
  { open, setOpen, gridRef, onChange, setRecents },
) {
  const choose = makeIconChooser({ onChange, setRecents, setOpen });
  const onKeyDown = makePickerKeyHandler({
    open,
    setOpen,
    gridRef,
    onChange,
    choose,
  });
  return { choose, onKeyDown };
}

export function TerminalPresetIconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const gridRef = useRef(null);
  const catalogRef = useRef(null);
  const ALL_OPTIONS = settingsDep("TERMINAL_PRESET_ICON_OPTIONS");
  const ICON_BY_ID = settingsDep("TERMINAL_PRESET_ICON_BY_ID");
  const [recents, setRecents] = useState(() => readRecentIcons(ICON_BY_ID));
  const selected = ICON_BY_ID[value] || ICON_BY_ID.terminal;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cat = ICON_CATEGORIES.find((c) => c.id === category) ||
    ICON_CATEGORIES[0];
  const filtered = ALL_OPTIONS.filter((option) =>
    matchesIconQuery(normalizedQuery, option) && cat.match(option.id)
  );
  const recentOptions = recents.map((id) => ICON_BY_ID[id]).filter(Boolean);
  const { choose, onKeyDown } = useIconPickerInteraction({
    open,
    setOpen,
    gridRef,
    onChange,
    setRecents,
  });
  useEffect(() => scrollSelectedTile(gridRef), [
    open,
    normalizedQuery,
    category,
  ]);
  return html`
    <div className="terminal-profile-icon-picker" onKeyDown=${onKeyDown}>
      ${renderIconTrigger({ open, selected, setOpen })}
      ${renderCatalog({
        open,
        catalogRef,
        query,
        setQuery,
        filtered,
        total: ALL_OPTIONS.length,
        category,
        setCategory,
        recentOptions,
        value,
        choose,
        gridRef,
      })}
    </div>
  `;
}
