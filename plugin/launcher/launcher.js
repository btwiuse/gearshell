// Launcher: the empty-workspace Task Launcher card, plus the
// terminal-preset picker that shows the available terminal profiles
// when the user expands the Terminal launcher button.
//
// This module owns the `fallback` dockview panel. The Terminal
// launch picker, the empty-workspace launcher card, and the
// fallback / launcher panel registration all live here. The panel
// reads a lot of app.js globals (workspace config, panel-creation
// catalog, terminal profile helpers, dockview dispatch) so the
// dep shim is the load-bearing piece.
//
// Dependency-injection shim: app.js calls `initLauncher(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `launcherDep(name)`.
// Mirrors the same pattern used by home.js / settings.js /
// crush-runner.js / files.js / runtime.js / deck.js.

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, Star } from "lucide-react";
import { nextPanelIndex } from "../../app-panel-ids.js";
import htm from "htm";

const html = htm.bind(React.createElement);

let __launcherDeps = null;
export function initLauncher(dependencies) {
  __launcherDeps = dependencies;
}
export function launcherDep(name) {
  if (__launcherDeps == null) {
    throw new Error(
      "launcher: initLauncher() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __launcherDeps[name];
  if (value === undefined) {
    throw new Error(`launcher: missing dependency ${name}`);
  }
  return value;
}

// Fallback launcher body for TerminalLaunchPicker:
function TerminalLaunchPrimary({ iconSize, menuRole, onLaunch }) {
  const defaultProfile = launcherDep("getDefaultTerminalProfile")();
  const DefaultIcon = launcherDep("getTerminalPresetIcon")(defaultProfile);
  return html`
    <button
      className="terminal-launch-primary"
      type="button"
      role=${menuRole}
      title=${launcherDep("terminalCommand")(defaultProfile)}
      onClick=${() => onLaunch(defaultProfile)}
    >
      <${DefaultIcon} size=${iconSize} aria-hidden=${true}/>
      <span>Terminal</span>
    </button>
  `;
}

function TerminalProfileOptions({ iconSize, menuRole, onLaunch }) {
  return html`
    <div
      className="terminal-launch-options"
      role=${menuRole ? "menu" : undefined}
    >
      ${launcherDep("getTerminalProfiles")().map((profile) => {
        const Icon = launcherDep("getTerminalPresetIcon")(profile);
        return html`
          <button
            key=${profile.id}
            type="button"
            role=${menuRole}
            title=${launcherDep("terminalCommand")(profile)}
            onClick=${() => onLaunch(profile)}
          >
            <${Icon} size=${iconSize} aria-hidden=${true}/>
            <span>${profile.name}</span>
          </button>
        `;
      })}
    </div>
  `;
}

function TerminalLaunchPicker(
  { className, iconSize, inMenu = false, onLaunch },
) {
  const [expanded, setExpanded] = useState(false);
  const menuRole = inMenu ? "menuitem" : undefined;

  return html`
    <div className=${`terminal-launch-picker ${className}`}>
      <div className="terminal-launch-row">
        <${TerminalLaunchPrimary} iconSize=${iconSize} menuRole=${menuRole} onLaunch=${onLaunch}/>
        <button
          className="terminal-launch-toggle"
          type="button"
          aria-label=${expanded
            ? "Hide terminal presets"
            : "Show terminal presets"}
          aria-expanded=${expanded}
          onClick=${() => setExpanded((open) => !open)}
        >
          <${ChevronDown}
            className=${expanded
              ? "terminal-launch-chevron open"
              : "terminal-launch-chevron"}
            size=${14}
            aria-hidden=${true}
          />
        </button>
      </div>
      ${expanded &&
        html`<${TerminalProfileOptions} iconSize=${iconSize} menuRole=${menuRole} onLaunch=${onLaunch}/>`}
    </div>
  `;
}

// Fallback launcher body for FallbackPage:
function useLauncherCollapsedState() {
  const [showMore, setShowMore] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState(() =>
    launcherDep("loadConfig")().collapsedLauncherItems
  );

  useEffect(() => {
    const updateCollapsedItems = () => {
      setCollapsedItems(launcherDep("loadConfig")().collapsedLauncherItems);
      setShowMore(false);
    };
    window.addEventListener(
      launcherDep("WORKSPACE_CHANGED_EVENT"),
      updateCollapsedItems,
    );
    return () =>
      window.removeEventListener(
        launcherDep("WORKSPACE_CHANGED_EVENT"),
        updateCollapsedItems,
      );
  }, []);

  return { showMore, setShowMore, collapsedItems };
}

// One launcher row: the launch control (terminal picker or app button)
// plus a pin toggle that keeps the app at the top of the grid (P6).
function renderLauncherRow(
  { option, containerApi, addPanel, pinned, onTogglePin },
) {
  const control = option.component === "terminal"
    ? html`<${TerminalLaunchPicker}
      key=${option.component}
      className="empty-terminal-launch"
      iconSize=${18}
      onLaunch=${(profile) =>
        containerApi &&
        launcherDep("addTerminalPanel")(containerApi, undefined, profile)}
    />`
    : html`
      <button
        key=${option.component}
        className="launcher-item-action"
        type="button"
        onClick=${() => addPanel(option.component)}
      >
        <${option.icon} size=${18} aria-hidden=${true}/>
        <span>${option.label}</span>
      </button>
    `;
  return html`
    <div key=${option.component} className="launcher-row">
      <div className="launcher-row-control">${control}</div>
      <button
        type="button"
        className="launcher-pin"
        aria-pressed=${pinned}
        title=${pinned
          ? `Unpin ${option.label}`
          : `Pin ${option.label} to the top`}
        aria-label=${pinned
          ? `Unpin ${option.label}`
          : `Pin ${option.label} to the top`}
        onClick=${() => onTogglePin(option.component)}
      >
        <${Star} size=${15} className="launcher-pin-star" aria-hidden=${true}/>
      </button>
    </div>
  `;
}

function LauncherMoreToggle({ showMore, setShowMore }) {
  return html`
    <button
      type="button"
      className="launcher-more-toggle"
      aria-expanded=${showMore}
      onClick=${() => setShowMore((expanded) => !expanded)}
    >
      <${Ellipsis} size=${18} aria-hidden=${true}/>
      <span>${showMore ? "Less" : "More"}</span>
    </button>
  `;
}

// Pinned apps: the launcherOrder override list (pinnedLauncherItems in the
// shell config, normalized + synced with Settings). Pinned apps render first
// and are never folded into the More section.
function useLauncherPins() {
  const [pinnedItems, setPinnedItems] = useState(() =>
    launcherDep("loadConfig")().pinnedLauncherItems
  );
  useEffect(() => {
    const updatePinned = () =>
      setPinnedItems(launcherDep("loadConfig")().pinnedLauncherItems);
    window.addEventListener(
      launcherDep("WORKSPACE_CHANGED_EVENT"),
      updatePinned,
    );
    return () =>
      window.removeEventListener(
        launcherDep("WORKSPACE_CHANGED_EVENT"),
        updatePinned,
      );
  }, []);
  const togglePin = (component) => {
    const cfg = launcherDep("loadConfig")();
    const current = cfg.pinnedLauncherItems || [];
    const next = current.includes(component)
      ? current.filter((item) => item !== component)
      : [...current, component];
    launcherDep("saveConfig")({ ...cfg, pinnedLauncherItems: next });
  };
  return { pinnedItems, togglePin };
}

function useLauncherSearch() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  return { query, setQuery, q };
}

function useLauncherFocus(searchRef) {
  useEffect(() => {
    const focusSearch = () => {
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    focusSearch();
    window.addEventListener("GearShellPanelFocused", focusSearch);
    return () => window.removeEventListener("GearShellPanelFocused", focusSearch);
  }, [searchRef]);
}

// Pinned-first + collapsed split of the ordered catalog.
function launcherSections(options, collapsed, pinned) {
  return {
    primaryOptions: [
      ...options.filter((option) => pinned.has(option.component)),
      ...options.filter(
        (option) =>
          !pinned.has(option.component) && !collapsed.has(option.component),
      ),
    ],
    moreOptions: options.filter(
      (option) =>
        !pinned.has(option.component) && collapsed.has(option.component),
    ),
  };
}

// The app catalog in launcher order (user order, default order appended).
function useLauncherCatalog() {
  return launcherDep("normalizeLauncherOrder")(
    launcherDep("loadConfig")().launcherOrder,
  )
    .map((component) =>
      launcherDep("PANEL_CREATION_OPTIONS").find((option) =>
        option.component === component
      )
    )
    .filter(Boolean);
}

// Row renderer bound to the current container/pin state (kept in a hook so
// FallbackPage stays under the 50-line budget).
function useLauncherRowRenderer({ containerApi, addPanel, pinned, togglePin }) {
  return (option) =>
    renderLauncherRow({
      option,
      containerApi,
      addPanel,
      pinned: pinned.has(option.component),
      onTogglePin: togglePin,
    });
}

// The action list inside the launcher card: search results when a query is
// active, otherwise the primary rows + the More fold.
function LauncherActions(
  {
    matches,
    primaryOptions,
    moreOptions,
    rowFor,
    showMore,
    setShowMore,
    query,
  },
) {
  if (matches) {
    if (matches.length === 0) {
      return html`
        <p className="launcher-empty-match">No apps match "${query}"</p>
      `;
    }
    return matches.map(rowFor);
  }
  return [
    ...primaryOptions.map(rowFor),
    moreOptions.length > 0 &&
    html`<${LauncherMoreToggle} key="more" showMore=${showMore} setShowMore=${setShowMore}/>`,
    showMore &&
    html`
      <div key="more-options" className="launcher-more-options">
        ${moreOptions.map(rowFor)}
      </div>
    `,
  ];
}

function FallbackPage({ containerApi, className }) {
  const searchRef = useRef(null);
  const { showMore, setShowMore, collapsedItems } = useLauncherCollapsedState();
  const { pinnedItems, togglePin } = useLauncherPins();
  const { query, setQuery, q } = useLauncherSearch();
  const options = useLauncherCatalog();
  const addPanel = (component) => {
    if (!containerApi) return;
    launcherDep("addPanelByComponent")(containerApi, component);
  };
  const collapsed = new Set(collapsedItems);
  const pinned = new Set(pinnedItems);
  const { primaryOptions, moreOptions } = launcherSections(
    options,
    collapsed,
    pinned,
  );
  const rowFor = useLauncherRowRenderer({
    containerApi,
    addPanel,
    pinned,
    togglePin,
  });
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const matches = q
    ? options.filter((option) =>
      option.label.toLowerCase().includes(q) ||
      option.component.includes(q)
    )
    : null;
  return html`<${LauncherCard}
    className=${className}
    query=${query}
    setQuery=${setQuery}
    rowFor=${rowFor}
    matches=${matches}
    primaryOptions=${primaryOptions}
    moreOptions=${moreOptions}
    showMore=${showMore}
    setShowMore=${setShowMore}
    q=${q}
    searchRef=${searchRef}
  />`;
}

// The launcher card shell: title, search box and the action list.
function LauncherCard(
  {
    className,
    query,
    setQuery,
    rowFor,
    matches,
    primaryOptions,
    moreOptions,
    showMore,
    setShowMore,
    q,
    searchRef,
  },
) {
  const onKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    const items = [...event.currentTarget.closest(".empty-workspace-card").querySelectorAll(".launcher-item-action")];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === "Enter" && index >= 0) {
      event.preventDefault();
      items[index].click();
      return;
    }
    event.preventDefault();
    const start = index < 0 ? (event.key === "ArrowDown" ? -1 : 0) : index;
    const next = event.key === "ArrowDown" ? start + 1 : start - 1;
    items[(next + items.length) % items.length].focus();
  };
  return html`
    <div className=${className}>
      <div className="empty-workspace-card" onKeyDown=${onKeyDown}>
        <p>Task Launcher</p>
        <input
          className="launcher-search"
          type="search"
          placeholder="Search apps…"
          aria-label="Search apps"
          ref=${searchRef}
          value=${query}
          onChange=${(event) => setQuery(event.target.value)}
        />
        <div className="empty-workspace-actions">
          <${LauncherActions} matches=${matches} primaryOptions=${primaryOptions} moreOptions=${moreOptions} rowFor=${rowFor} showMore=${showMore} setShowMore=${setShowMore} query=${q}/>
        </div>
      </div>
    </div>
  `;
}

// Fallback launcher body for FallbackPanel:
function FallbackPanel({ containerApi }) {
  return html`<${FallbackPage} containerApi=${containerApi} className="fallback-panel panel-content"/>`;
}

// === Panel registration ===

// Register a new Fallback (Launcher) panel with dockview. Called from
// app.js's `addPanelByComponent` when the user picks Launcher from
// the panel menu, and from the restore-saved-panels path on boot.
// Registered by the launcher plugin (launcher-plugin.js); the kernel's
// empty-grid guards open the "launcher" component through the plugin
// path so the launcher implementation is swappable.
export function addFallbackPanel(api, group) {
  const id = nextPanelIndex("launcher");
  const panel = api.addPanel({
    id: `launcher-${id}`,
    component: "launcher",
    params: { launcherId: id, panelType: "launcher" },
    title: "Launcher",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = launcherDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "launcher" });
  panel.api.setActive();
  return panel;
}

// The "+" Add control + all-apps menu live in launcher-menu.js (500-line
// split); re-export so existing importers (app.js, app-shell.js) keep
// importing AddTerminalButton from this module.
export { AddTerminalButton } from "./launcher-menu.js";

export { FallbackPage, FallbackPanel, TerminalLaunchPicker };
