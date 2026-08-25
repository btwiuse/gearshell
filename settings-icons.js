// Terminal preset icon picker: a Lucide catalog browser.

import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown } from "lucide-react";
import { settingsDep } from "./settings-deps.js?v=20260825.1";
// === Terminal preset icon picker ===
// `TerminalPresetIconPicker` is a 300+-icon Lucide catalog browser
// used by the terminal preset editor's icon field. It uses the
// shared TERMINAL_PRESET_ICON_BY_ID / TERMINAL_PRESET_ICON_OPTIONS
// tables (passed through the dep shim so settings.js doesn't reach
// into the global app state directly) and renders a paginated grid
// of icon buttons + a search box.

export function TerminalPresetIconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const catalogRef = useRef(null);
  const gridRef = useRef(null);
  const RECENT_KEY = 'crush-runner-recent-icons';
  const RECENT_LIMIT = 8;
  const ALL_OPTIONS = settingsDep("TERMINAL_PRESET_ICON_OPTIONS");
  const ICON_BY_ID = settingsDep("TERMINAL_PRESET_ICON_BY_ID");
  const CATEGORIES = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'agents', label: 'Agents', match: (id) => /^(bot|sparkles|message-circle|message-square|wand|wand-sparkles|atom|mic|lightbulb|workflow|zap)/i.test(id) },
    { id: 'terminal', label: 'Terminal', match: (id) => /^(terminal|square-terminal|code|code-2|braces|brackets|command|hash|chevron-right)/i.test(id) },
    { id: 'tools', label: 'Tools', match: (id) => /^(wrench|screwdriver|hammer|settings|gear|tool|pencil|pen|brush|scissors|package|box|boxes|cog)/i.test(id) },
    { id: 'media', label: 'Media', match: (id) => /^(image|music|video|film|camera|microphone|headphones|volume|play|pause|fast-forward|rewind)/i.test(id) },
    { id: 'shapes', label: 'Shapes', match: (id) => /^(circle|square|triangle|hexagon|octagon|star|heart|diamond|polygon)/i.test(id) },
  ];
  const [recents, setRecents] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => ICON_BY_ID[id]).slice(0, RECENT_LIMIT) : [];
    } catch { return []; }
  });
  const selected = ICON_BY_ID[value] || ICON_BY_ID.terminal;
  const SelectedIcon = selected.icon;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (option) => {
    if (!normalizedQuery) return true;
    const haystack = `${option.label} ${option.id}`.toLocaleLowerCase();
    if (haystack.includes(normalizedQuery)) return true;
    // Loose token match: every char of the query appears in order somewhere
    // in the haystack. Lets "bt" find "bot" without exact substring luck.
    let cursor = 0;
    for (const char of normalizedQuery) {
      const next = haystack.indexOf(char, cursor);
      if (next === -1) return false;
      cursor = next + 1;
    }
    return true;
  };
  const cat = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];
  const filtered = ALL_OPTIONS.filter((option) => matchesQuery(option) && cat.match(option.id));
  const recentOptions = recents.map((id) => ICON_BY_ID[id]).filter(Boolean);

  // Scroll the currently selected tile into view whenever the catalog opens
  // or the search query changes; without this the user opens the picker and
  // stares at a grid that does not show what they already have.
  useEffect(() => {
    if (!open || !gridRef.current) return;
    const tile = gridRef.current.querySelector('[data-selected="true"]');
    if (tile && typeof tile.scrollIntoView === 'function') {
      tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [open, normalizedQuery, category]);

  const choose = (optionId) => {
    onChange(optionId);
    setRecents((current) => {
      const next = [optionId, ...current.filter((id) => id !== optionId)].slice(0, RECENT_LIMIT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const tiles = gridRef.current ? Array.from(gridRef.current.querySelectorAll('.terminal-profile-icon-option')) : [];
    if (tiles.length === 0) return;
    const currentIndex = tiles.findIndex((tile) => tile.dataset.selected === 'true');
    let target = currentIndex;
    if (event.key === 'Enter' || event.key === ' ') {
      const id = tiles[currentIndex >= 0 ? currentIndex : 0]?.dataset.iconId;
      if (id) choose(id);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = currentIndex + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = currentIndex - 1;
    if (target < 0) target = tiles.length - 1;
    if (target >= tiles.length) target = 0;
    const nextId = tiles[target]?.dataset.iconId;
    if (nextId) onChange(nextId);
  };

  return React.createElement('div', {
    className: 'terminal-profile-icon-picker',
    onKeyDown,
  },
    React.createElement('button', {
      type: 'button',
      className: 'terminal-profile-icon-trigger',
      'aria-expanded': open,
      'aria-controls': 'terminal-preset-icon-catalog',
      onClick: () => setOpen((visible) => !visible),
    },
    React.createElement(SelectedIcon, { size: 18, 'aria-hidden': true }),
    React.createElement('span', { className: 'terminal-profile-icon-trigger-label' }, selected.label),
    open
      ? React.createElement(ChevronDown, { size: 16, 'aria-hidden': true, style: { transform: 'rotate(180deg)' } })
      : React.createElement(ChevronDown, { size: 16, 'aria-hidden': true }),
    ),
    open && React.createElement('div', {
      ref: catalogRef,
      id: 'terminal-preset-icon-catalog',
      className: 'terminal-profile-icon-catalog',
    },
      React.createElement('div', { className: 'terminal-profile-icon-catalog-toolbar' },
        React.createElement('input', {
          type: 'search', value: query, placeholder: `Search ${ALL_OPTIONS.length} icons…`,
          'aria-label': 'Search icons', autoComplete: 'off', autoFocus: true,
          onChange: (event) => setQuery(event.target.value),
        }),
        React.createElement('span', { className: 'terminal-profile-icon-result-count' },
          `${filtered.length}${filtered.length === 1 ? ' icon' : ' icons'}`,
        ),
      ),
      React.createElement('div', { className: 'terminal-profile-icon-categories', role: 'tablist' },
        CATEGORIES.map((c) => React.createElement('button', {
          key: c.id,
          type: 'button',
          role: 'tab',
          'aria-selected': category === c.id,
          className: `terminal-profile-icon-category${category === c.id ? ' selected' : ''}`,
          onClick: () => setCategory(c.id),
        }, c.label)),
      ),
      recentOptions.length > 0 && React.createElement('div', { className: 'terminal-profile-icon-recent' },
        React.createElement('span', { className: 'terminal-profile-icon-section-label' }, 'Recent'),
        React.createElement('div', { className: 'terminal-profile-icon-recent-grid' },
          recentOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = value === option.id;
            return React.createElement('button', {
              key: option.id,
              type: 'button',
              className: `terminal-profile-icon-option${isSelected ? ' selected' : ''}`,
              'data-icon-id': option.id,
              'data-selected': isSelected,
              title: option.label,
              'aria-label': option.label,
              'aria-pressed': isSelected,
              onClick: () => choose(option.id),
            }, React.createElement(Icon, { size: 22, 'aria-hidden': true }));
          }),
        ),
      ),
      filtered.length > 0
        ? React.createElement('div', {
            ref: gridRef,
            className: 'terminal-profile-icon-grid',
            role: 'group',
            'aria-label': 'Icon results',
          }, filtered.map((option) => {
            const Icon = option.icon;
            const isSelected = value === option.id;
            return React.createElement('button', {
              key: option.id,
              type: 'button',
              className: `terminal-profile-icon-option${isSelected ? ' selected' : ''}`,
              'data-icon-id': option.id,
              'data-selected': isSelected,
              title: option.label,
              'aria-label': option.label,
              'aria-pressed': isSelected,
              onClick: () => choose(option.id),
            },
            React.createElement(Icon, { size: 26, 'aria-hidden': true }),
            React.createElement('span', null, option.label),
            );
          }))
        : React.createElement('p', { className: 'terminal-profile-icon-empty' }, 'No icons match. Try fewer letters or a different category.'),
      React.createElement('div', { className: 'terminal-profile-icon-footer' },
        React.createElement('span', null, '↑↓←→ to browse · Enter to apply · Esc to close'),
      ),
    ),
  );
}
