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
import { Play, Terminal } from "lucide-react";
import { DockviewDefaultTab } from "dockview-react";
import {
  addWorkspaceTaskPanel,
  WorkspaceTaskPanel,
} from "./panels-task.js?v=20260828.1";
// Wagi Dog web-pet lives in its own ES module so its dependencies
// (the pet sprite / animation engine) don't bloat the main shell
// bundle. We load it lazily via a dynamic import so that production
// builds where the web-pet submodule failed to materialise (404s on
// /web-pet/index.js) don't crash the whole shell — the desktop pet
// just stays disabled, the rest of the app keeps working.
let webPetModulePromise = null;
function loadWebPetModule() {
  if (webPetModulePromise) return webPetModulePromise;
  webPetModulePromise = import("./web-pet/index.js")
    .then((mod) => mod.default || mod.WebPet)
    .catch((error) => {
      // Reset so a later retry (e.g. after a config toggle) can try
      // again; surface the failure once via the dev-error overlay so
      // it's diagnosable but don't throw — the shell has to keep
      // running without the desktop pet.
      webPetModulePromise = null;
      if (typeof console !== "undefined") {
        console.warn("web-pet unavailable:", error);
      }
      return null;
    });
  return webPetModulePromise;
}

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
// Per-panel-type counters so multiple instances of the same panel
// type can coexist (Terminal / Iframe / Workspace Task) while
// Workbench / VM stay singletons. Module-scoped so they survive
// React re-renders but reset on page reload.
let terminalIdCounter = 0;
let workbenchIdCounter = 0;
let vmIdCounter = 0;
let groupIdCounter = 0;
let iframeIdCounter = 0;

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

  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// === GroupPanel ===
function GroupPanel() {
  return React.createElement(
    "div",
    { className: "group-panel panel-content" },
    React.createElement("img", { src: "group.png", alt: "Gear Shell group" }),
  );
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

  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// === WorkbenchPanel ===
function WorkbenchPanel({ api, params }) {
  const wrapperRef = useRef(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return panelsDep("attachWorkbenchSession")(
      params.workbenchId,
      params.config || panelsDep("getWorkbenchPanelConfig")(),
      wrapper,
      api,
    );
  }, [api, params.workbenchId]);
  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// === VmPanel ===
function VmPanel({ api, params }) {
  const wrapperRef = useRef(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return panelsDep("attachVmSession")(
      params.vmId,
      params.config || panelsDep("getVmPanelConfig")(),
      wrapper,
      api,
    );
  }, [api, params.vmId]);
  return React.createElement("div", {
    ref: wrapperRef,
    className: "panel-content",
  });
}

// === PanelTab ===
function PanelTab(props) {
  const Icon = props.params.panelType === "terminal"
    ? panelsDep("getTerminalPresetIcon")(props.params.profile)
    : getPanelIcons()[props.params.panelType] || Terminal;
  return React.createElement(
    "div",
    { className: "panel-tab" },
    React.createElement(Icon, {
      className: "panel-tab-icon",
      size: 14,
      "aria-hidden": true,
    }),
    React.createElement(DockviewDefaultTab, props),
  );
}

// === WagiDogPet ===
function WagiDogPet() {
  const petRef = useRef(null);
  const WebPetRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadWebPetModule().then((WebPetClass) => {
      if (cancelled) return;
      WebPetRef.current = WebPetClass;
      if (WebPetClass) syncWagiDog();
    });
    function syncWagiDog() {
      if (panelsDep("loadConfig")().wagiDogEnabled) {
        if (WebPetRef.current && !petRef.current) {
          petRef.current = new WebPetRef.current();
        }
      } else {
        petRef.current?.destroy();
        petRef.current = null;
      }
    }
    syncWagiDog();
    window.addEventListener(panelsDep("WORKSPACE_CHANGED_EVENT"), syncWagiDog);
    return () => {
      cancelled = true;
      window.removeEventListener(
        panelsDep("WORKSPACE_CHANGED_EVENT"),
        syncWagiDog,
      );
      petRef.current?.destroy();
      petRef.current = null;
    };
  }, []);

  return null;
}

// === addTerminalPanel ===
function addTerminalPanel(
  api,
  group,
  profile = panelsDep("getDefaultTerminalProfile")(),
) {
  const id = ++terminalIdCounter;
  const panel = api.addPanel({
    id: `terminal-${id}`,
    component: "terminal",
    params: {
      terminalId: id,
      panelType: "terminal",
      profile: panelsDep("clone")(profile),
    },
    title: `${profile.name || "Terminal"} ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, {
    component: "terminal",
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
  const id = ++workbenchIdCounter;
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

// === addVmPanel ===
function addVmPanel(api, group, config = panelsDep("getVmPanelConfig")()) {
  const id = ++vmIdCounter;
  const panel = api.addPanel({
    id: `vm-${id}`,
    component: "vm",
    params: { vmId: id, panelType: "vm", config: panelsDep("clone")(config) },
    title: `VM ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, {
    component: "vm",
    config: panelsDep("clone")(config),
  });
  panel.api.setActive();
  return panel;
}

// === addGroupPanel ===
function addGroupPanel(api, group) {
  const id = ++groupIdCounter;
  const panel = api.addPanel({
    id: `group-${id}`,
    component: "group",
    params: { groupId: id, panelType: "group" },
    title: "Group",
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, { component: "group" });
  panel.api.setActive();
  return panel;
}

// === addIframePanel ===
function addIframePanel(api, config, group) {
  const id = ++iframeIdCounter;
  const panel = api.addPanel({
    id: `iframe-${id}`,
    component: "iframe",
    params: { iframeId: id, panelType: config.panelType, ...config },
    title: config.title,
    ...(group && { position: { referenceGroup: group } }),
  });
  panelsDep("rememberOpenPanel")(panel, { component: config.panelType });
  panel.api.setActive();
  return panel;
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
  terminal: addTerminalPanel,
  workbench: addWorkbenchPanel,
  vm: addVmPanel,
  "workspace-task": addWorkspaceTaskPanel,
  group: addGroupPanel,
  home: (api, group) => panelsDep("addLandingPanel")(api, group),
  deck: (api, group) => panelsDep("addDeckPanel")(api, group),
  settings: (api, group) => panelsDep("addSettingsPanel")(api, group),
  files: (api, group) => panelsDep("addFilesPanel")(api, group),
  runtime: (api, group) => panelsDep("addRuntimePanel")(api, group),
  fallback: (api, group) => panelsDep("addFallbackPanel")(api, group),
  "crush-runner": (api, group) => panelsDep("addCrushRunnerPanel")(api, group),
};

function addPanelByComponent(api, component, group, options) {
  const adder = PANEL_ADDERS[component];
  if (adder) return adder(api, group, options);
  const iframeConfig = panelsDep("IFRAME_PANEL_OPTIONS")[component];
  if (iframeConfig) return addIframePanel(api, iframeConfig, group, options);
  return panelsDep("addLandingPanel")(api, group, options);
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
  addGroupPanel,
  addIframePanel,
  addPanelByComponent,
  addTerminalPanel,
  addVmPanel,
  addWorkbenchPanel,
  addWorkspaceTaskPanel,
  GroupPanel,
  IframePanel,
  PANEL_ICONS,
  PanelTab,
  TerminalPanel,
  VmPanel,
  WagiDogPet,
  WorkbenchPanel,
  WorkspaceTaskPanel,
};
