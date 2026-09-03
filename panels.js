// Atomic panels + their dockview registration helpers.
//
// This module owns the thin React wrappers around each overlay
// session machinery (Terminal / Workbench / VM / Workspace Task /
// Group image / Iframe / the fallback Launcher), the panel-action
// `+` button, the tab title renderer, the Wagi Dog web-pet mount,
// and the `add*Panel` + `addPanelByComponent` dispatch functions
// that register them with dockview.
//
// Dependency-injection shim: app.js calls `initPanels(dependencies)`
// from the bottom of its module body, populating a small lookup
// table that the helpers below read lazily via `panelsDep(name)`.
// Mirrors the same pattern used by home.js / settings.js /
// crush-runner.js / files.js / runtime.js / deck.js / launcher.js.

import React, { useEffect, useRef, useState } from "react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { Play, Terminal, icons as LucideIcons } from "lucide-react";
import { DockviewDefaultTab } from "dockview-react";
import { nextPanelIndex } from "./app-panel-ids.js";
import {
  addWorkspaceTaskPanel,
  WorkspaceTaskPanel,
} from "./panels-task.js";
import {
  getPluginIframeConfig,
  getPluginIcon,
  openPluginPanel,
} from "./plugins.js";
// Wagi Dog web-pet lives in its own ES module so its dependencies
// (the pet sprite / animation engine) don't bloat the main shell
// bundle. We load it lazily via a dynamic import so that production
// builds where the web-pet submodule failed to materialise (404s on
// /web-pet/index.js) don't crash the whole shell — the desktop pet
// just stays disabled, the rest of the app keeps working.
let __panelsDeps = null;
export function initPanels(dependencies) {
  __panelsDeps = dependencies;
}
export function panelsDep(name) {
  if (__panelsDeps == null) {
    throw new Error(
      "panels: initPanels() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __panelsDeps[name];
  if (value === undefined) {
    throw new Error(`panels: missing dependency ${name}`);
  }
  return value;
}

// === Counters ===

// === Panel icon catalog ===
// `Object.fromEntries(PANEL_CREATION_OPTIONS.map(...))` builds the
// component -> Lucide icon map. We also manually add `.task` because
// the launcher doesn't list workspace tasks in PANEL_CREATION_OPTIONS
// (they're added per-workspace), but PanelTab can still hit this
// path with `params.panelType === 'task'`.
//
// PANEL_ICONS is computed lazily through a getter so module
// evaluation doesn't reach into `panelsDep("PANEL_CREATION_OPTIONS")`
// before app.js's `initPanels()` call has populated the dep table.
// The first lookup happens inside PanelTab's render path, by which
// point `initPanels` has already run.
let __panelsIconsCache = null;
function getPanelIcons() {
  if (__panelsIconsCache == null) {
    __panelsIconsCache = Object.fromEntries(
      panelsDep("PANEL_CREATION_OPTIONS").map((
        { component, icon },
      ) => [component, icon]),
    );
    __panelsIconsCache.task = Play;
  }
  return __panelsIconsCache;
}

// === TerminalPanel ===
function TerminalPanel({ api, params }) {
  const id = params.terminalId;
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return panelsDep("attachTerminalSession")(id, params.profile, wrapper, api);
  }, [id, params.profile]);

  return html`<div ref=${wrapperRef} className="panel-content"></div>`;
}

// === IframePanel ===
function IframePanel({ api, params }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return panelsDep("attachIframeSession")(
      params.iframeId,
      params,
      wrapper,
      api,
    );
  }, [api, params.iframeId]);

  return html`<div ref=${wrapperRef} className="panel-content"></div>`;
}

// === PanelTab ===
function PanelTab(props) {
  const Icon = (props.params.panelType === "console" || props.params.panelType === "terminal")
    ? panelsDep("getTerminalPresetIcon")(props.params.profile)
    : getPanelIcons()[props.params.panelType] ||
      LucideIcons[getPluginIcon(props.params.panelType)] || Terminal;
  return html`
    <div className="panel-tab">
      <${Icon} className="panel-tab-icon" size=${14} aria-hidden=${true}/>
      <${DockviewDefaultTab} ...${props}/>
    </div>
  `;
}

// === addTerminalPanel ===
function addTerminalPanel(
  api,
  group,
  profile = panelsDep("getDefaultTerminalProfile")(),
) {
  const id = nextPanelIndex("terminal");
  const panel = api.addPanel({
    id: `terminal-${id}`,
    component: "console",
    params: {
      terminalId: id,
      panelType: "console",
      profile: panelsDep("clone")(profile),
    },
    title: `${profile.name || "Terminal"} ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, {
    component: "console",
    profile: panelsDep("clone")(profile),
  });
  panel.api.setActive();
}

// === addWorkbenchPanel ===
function addWorkbenchPanel(
  api,
  group,
  config = panelsDep("getWorkbenchPanelConfig")(),
) {
  const existing = api.panels.find((panel) =>
    panel.id.startsWith("workbench-")
  );
  if (existing) {
    existing.api.setActive();
    return existing;
  }
  const id = nextPanelIndex("workbench");
  const panel = api.addPanel({
    id: `workbench-${id}`,
    component: "workbench",
    params: {
      workbenchId: id,
      panelType: "workbench",
      config: panelsDep("clone")(config),
    },
    title: "Workbench",
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, {
    component: "workbench",
    config: panelsDep("clone")(config),
  });
  panel.api.setActive();
  return panel;
}


// === addIframePanel ===
// `options` lets the caller pass per-open context (e.g. Spotlight
// asking for `section: "workspace"`) that the iframe plugin can
// consume on load. We translate `options.section` into a `?section=...`
// query string on the iframe `src` so the plugin page can read it
// from `location.search` without needing a postMessage roundtrip; the
// kernel also threads the same value through `params` so the iframe
// can react to live updates via its own bridge.
function addIframePanel(api, config, group, options) {
  const id = nextPanelIndex("iframe");
  // Lazy w9y install: the iframe plugin declares `w9y: { mod, version? }`
  // on its manifest; ensureW9yDependencies skips iframe plugins on boot
  // so this is the first chance to fire the apply. The page may mount
  // before the install completes — its JS polls w9y.status / listens
  // for w9y.changed (see plugin/bubbletea-playground for the canonical pattern).
  if (config?.w9y && typeof config.w9y.mod === "string" && config.w9y.mod) {
    panelsDep("triggerPluginW9yInstall")(config.w9y);
  }
  // Per-open URL override. The caller passes `route: "<name>"` and
  // the manifest-declared routes (already in the plugin config) tell
  // the kernel which query string to append. Routes are the iframe
  // plugin's own responsibility — this side just translates the named
  // route into a URL.
  const configWithOverride = { ...config };
  const routes = configWithOverride.routes;
  const src = applyIframeSrcOverride(configWithOverride.src, { ...(options || {}), __routes: routes });
  // Replace `src` in the spread so the iframe session mounts the
  // overridden URL while still picking up the rest of the config.
  configWithOverride.src = src;
  const panel = api.addPanel({
    id: `iframe-${id}`,
    component: "iframe",
    params: { iframeId: id, panelType: configWithOverride.panelType, pluginIcon: configWithOverride.icon, ...configWithOverride, ...(options || {}) },
    title: configWithOverride.title,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, { component: configWithOverride.panelType });
  panel.api.setActive();
  return panel;
}

// Per-open URL helper. Currently translates `options.section` into
// `?section=...` on the iframe `src`. The whitelist lives in the
// Settings iframe (it ignores unknown values), so this side stays
// conservative: we only forward the key, and only when the
// iframe plugin's manifest is one we know about.
// Per-open URL helper. If `options.route` is set and matches a route
// declared by the iframe plugin's manifest, append the route's query
// string to the iframe `src`. Whitelist (route names: lowercase a-z
// + dash, max 32 chars) lives in the iframe page — the manifest
// itself is the source of truth, this side just translates the
// named route into a URL override.
function applyIframeSrcOverride(src, options) {
  if (!src || !options) return src;
  const route = typeof options.route === "string" ? options.route : null;
  if (!route) return src;
  // Find the route definition on the iframe config (caller spread
  // it in via ...configWithOverride so the kernel's `params.routes`
  // is the single source of truth).
  const routes = Array.isArray(options.__routes) ? options.__routes : null;
  const match = routes?.find((entry) => entry && entry.name === route);
  if (!match) return src;
  // Pull the `query` field off the route and merge it into src.
  const query = typeof match.query === "string" ? match.query : "";
  if (!query) return src;
  try {
    const url = new URL(src, window.location.origin);
    // Accept any key=value&k=v format from the manifest. Validate
    // keys+values against a conservative character class so a
    // misbehaving manifest can't smuggle a hash or javascript: URL.
    const safePair = /^([a-zA-Z][a-zA-Z0-9_-]{0,30})=([a-zA-Z0-9._\-+%,/]{0,80})$/;
    for (const part of query.split("&")) {
      const [rawKey, ...rest] = part.split("=");
      const key = decodeURIComponent(rawKey || "").trim();
      const value = decodeURIComponent(rest.join("=")).trim();
      if (!safePair.test(`${rawKey}=${value}`)) continue;
      url.searchParams.set(key, value);
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return src;
  }
}

// === addPanelByComponent ===
// Single dispatch entry point used by every other module that needs
// to spawn a panel from just its component name (home CTAs, launcher
// menu items, crush-runner, settings, boot path). The local panels
// (terminal / workbench / vm / workspace-task / group / iframe) are
// referenced directly; the cross-module panels (home / deck /
// settings / files / runtime / fallback / crush-runner) are reached
// through the dep shim so panels.js never has to import them and so
// initPanels becomes the single wiring point for the whole shell.
const PANEL_ADDERS = {
  console: (api, group, options) =>
    addTerminalPanel(api, group, options?.profile),
  terminal: (api, group, options) =>
    addTerminalPanel(api, group, options?.profile),
  "workspace-task": (api, group) => addWorkspaceTaskPanel(api, group),
};

function addPanelByComponent(api, component, group, options) {
  // Legacy name for the launcher panel (pre-plugin snapshots saved
  // component "fallback"); route it to the pluginized "launcher".
  if (component === "fallback") component = "launcher";
  if (component === "launcher") {
    const existing = api.panels.find(
      (panel) => panel.params?.panelType === "launcher",
    );
    if (existing) {
      existing.api.setActive();
      return existing;
    }
  }
  const direction = options?.direction;
  let targetGroup = group;
  if (direction) {
    targetGroup = api.addGroup({
      ...(group && { referenceGroup: group }),
      direction,
    }).id;
  }
  const adder = PANEL_ADDERS[component];
  if (adder) return adder(api, targetGroup, options);
  // Plugin panels register with the kernel (plugins.js); the generic
  // opener mints `${component}-<n>` ids exactly like the built-ins.
  const pluginPanel = openPluginPanel(api, component, targetGroup);
  if (pluginPanel) return pluginPanel;
  // Plugin iframe panels (Browser / Bonsai / Codigo / Crush / Rick Roll
  // are built-ins of this kind) host a sandboxed iframe like the legacy
  // kernel iframe branch did — same panel, config-driven source.
  const pluginIframe = getPluginIframeConfig(component);
  if (pluginIframe) {
    return addIframePanel(api, pluginIframe, targetGroup, options);
  }
  return panelsDep("addLandingPanel")(api, targetGroup, options);
}

// Backwards-compatible name: external readers (e.g. the test harness,
// legacy imports) can still ask for PANEL_ICONS by name. Internally
// we route through the lazy `getPanelIcons()` so the dep table is
// always populated before the map is built.
const PANEL_ICONS = new Proxy({}, {
  get(_target, prop) {
    return getPanelIcons()[prop];
  },
  has(_target, prop) {
    return prop in getPanelIcons();
  },
  ownKeys() {
    return Object.keys(getPanelIcons());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const map = getPanelIcons();
    return prop in map
      ? {
        configurable: true,
        enumerable: true,
        writable: false,
        value: map[prop],
      }
      : undefined;
  },
});

export {
  addIframePanel,
  addPanelByComponent,
  addTerminalPanel,
  addWorkbenchPanel,
  addWorkspaceTaskPanel,
  IframePanel,
  PANEL_ICONS,
  PanelTab,
  TerminalPanel,
  WorkspaceTaskPanel,
};
