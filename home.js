// Home: the marketing landing page shown by default.
//
// This module owns the `home` dockview panel: LandingPanel composes the
// section components (home-sections.js / home-xcards.js) and wires the
// openPanel/openExternal/scrollToId callbacks, and addLandingPanel
// registers the panel with dockview. Copy and data live in home-data.js.
// Kept out of app.js so the main bundle stays focused on shell internals
// and the home page can be styled + iterated in isolation (home.css).
//
// Dependency-injection shim: app.js calls `initHome(dependencies)` from
// the bottom of its module body, populating a small lookup table that
// the helpers below read lazily via `homeDep(name)`. Mirrors the same
// pattern as crush-runner.js so neither file has to know about the
// other's internals.

import React from "react";
import { features, GH, quotes, steps } from "./home-data.js?v=20260828.1";
import { nextPanelIndex } from "./app-panel-ids.js?v=20260828.76";
import {
  HomeDemo,
  HomeFeatures,
  HomeFooter,
  HomeHero,
  HomeHow,
  HomeLocalFirst,
  HomeNav,
  HomeQuotes,
} from "./home-sections.js?v=20260828.2";
import { HomeFieldXCard, HomeGapXCard } from "./home-xcards.js?v=20260828.1";

let __homeDeps = null;
export function initHome(dependencies) {
  __homeDeps = dependencies;
}
function homeDep(name) {
  if (__homeDeps == null) {
    throw new Error(
      "home: initHome() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __homeDeps[name];
  if (value === undefined) {
    throw new Error(`home: missing dependency ${name}`);
  }
  return value;
}

export function LandingPanel({ containerApi }) {
  const openPanel = (component) => {
    const api = containerApi || homeDep("getDockviewApi")();
    if (api) homeDep("addPanelByComponent")(api, component);
  };
  const openExternal = (url) => window.open(url, "_blank", "noopener");
  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return React.createElement(
    "div",
    { className: "landing-panel panel-content" },
    React.createElement(
      "div",
      { className: "mkt-page" },
      React.createElement(HomeNav, { scrollToId, GH }),
      React.createElement(HomeHero, {
        openPanel,
        openExternal,
        scrollToId,
        GH,
      }),
    ),
    React.createElement(HomeFeatures, { features }),
    React.createElement(HomeDemo, { openPanel }),
    React.createElement(HomeLocalFirst),
    React.createElement(HomeHow, { steps }),
    React.createElement(HomeQuotes, { quotes }),
    React.createElement(HomeGapXCard),
    React.createElement(HomeFieldXCard),
    React.createElement(HomeFooter, { openPanel, scrollToId, GH }),
  );
}

// Register a new Home panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Home from the panel menu,
// from the restore-saved-panels path on boot, and from the auto-start
// of `home` panels configured in `cfg.startupPanels`.
export function addLandingPanel(api, group) {
  const id = nextPanelIndex("home");
  const panel = api.addPanel({
    id: `home-${id}`,
    component: "home",
    params: { homeId: id, panelType: "home" },
    title: "Home",
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = homeDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "home" });
  panel.api.setActive();
  return panel;
}
