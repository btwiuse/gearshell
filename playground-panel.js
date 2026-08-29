// playground-panel.js — the GearShell API Playground panel.
//
// A single tabbed page for exercising the whole window.GearShell API
// surface against the live workspace: Explorer (catalog + generated
// forms + JSON results + gctl equivalents), Providers (model provider
// CRUD over config.providers) and Events (live feed + ring drain).
// Every Explorer call goes through the same synchronous bridge the
// gctl CLI wraps, so the playground is also a live spec of what agents
// can do.
//
// Presentational pieces live in playground-parts.js; the three tabs in
// playground-explorer.js / playground-providers.js /
// playground-events-view.js; the method catalog (pure data) in
// playground-api-catalog.js (500-line rule).

import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ExplorerView } from "./playground-explorer.js?v=20260829.19";
import { ProvidersView } from "./playground-providers.js?v=20260829.35";
import { EventsView } from "./playground-events-view.js?v=20260829.14";
import { TabBar } from "./playground-parts.js?v=20260829.14";

const TABS = [
  { id: "explorer", label: "Explorer" },
  { id: "providers", label: "Providers" },
  { id: "events", label: "Events" },
];

export function PlaygroundPanel() {
  const [tab, setTab] = useState("explorer");
  return React.createElement(
    "div",
    { className: "playground-panel panel-content" },
    React.createElement(
      "div",
      { className: "playground-header" },
      React.createElement(SlidersHorizontal, { size: 16, "aria-hidden": true }),
      React.createElement("h2", null, "GearShell API Playground"),
      React.createElement(
        "span",
        { className: "playground-header-note" },
        "the same window.GearShell surface agents reach through gctl",
      ),
    ),
    React.createElement(TabBar, { tabs: TABS, active: tab, onSelect: setTab }),
    React.createElement(
      "div",
      { className: "playground-body" },
      tab === "explorer" && React.createElement(ExplorerView, null),
      tab === "providers" && React.createElement(ProvidersView, null),
      tab === "events" && React.createElement(EventsView, null),
    ),
  );
}
