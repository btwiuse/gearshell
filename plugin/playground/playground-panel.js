// playground-panel.js — the GearShell API Playground panel.
//
// A single tabbed page for exercising the whole window.GearShell API
// surface against the live workspace: Explorer (catalog + generated
// forms + JSON results + gear equivalents), Providers (model provider
// CRUD over config.providers) and Events (live feed + ring drain).
// Every Explorer call goes through the same synchronous bridge the
// gear CLI wraps, so the playground is also a live spec of what agents
// can do.
//
// Presentational pieces live in playground-parts.js; the three tabs in
// playground-explorer.js / playground-providers.js /
// playground-events-view.js; the method catalog (pure data) in
// playground-api-catalog.js (500-line rule).

import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ExplorerView } from "./playground-explorer.js?v=20260829.23";
import { ProvidersView } from "./playground-providers.js?v=20260829.99";
import { EventsView } from "./playground-events-view.js?v=20260829.17";
import { TabBar } from "./playground-parts.js?v=20260829.16";
import htm from "htm";

const html = htm.bind(React.createElement);

const TABS = [
  { id: "explorer", label: "Explorer" },
  { id: "providers", label: "Providers" },
  { id: "events", label: "Events" },
];

export function PlaygroundPanel() {
  const [tab, setTab] = useState("explorer");
  return html`
    <div className="playground-panel panel-content">
      <div className="playground-header">
        <${SlidersHorizontal} size=${16} aria-hidden=${true}/>
        <h2>GearShell API Playground</h2>
        <span className="playground-header-note">the same window.GearShell surface agents reach through gear</span>
      </div>
      <${TabBar} tabs=${TABS} active=${tab} onSelect=${setTab}/>
      <div className="playground-body">
        ${tab === "explorer" && html`<${ExplorerView}/>`}
        ${tab === "providers" && html`<${ProvidersView}/>`}
        ${tab === "events" && html`<${EventsView}/>`}
      </div>
    </div>
  `;
}
