// notes-bootstrap.js — Notes plugin entry point. Imports the store
// + components, wires them into a single React tree, and mounts the
// result on #app. Splitting the bootstrap out of index.html keeps
// the HTML minimal (style + importmap only) and lets us honour the
// 500-line rule.

import React from "react";
import { createRoot } from "react-dom/client";

import { html, bridgeAvailable } from "./notes.js";
import { useNotesStore } from "./notes-store.js";
import {
  Sidebar, NoteList, Editor, Notice, EmptyBridgeState,
} from "./notes-components.js";

export function App() {
  const store = useNotesStore();
  if (!bridgeAvailable) return html`<${EmptyBridgeState} />`;
  if (store.loading) {
    return html`
      <div class="loading-shell">
        <div class="loading-spinner" />
        <p>Loading notes…</p>
      </div>
    `;
  }
  // `data-view` on the shell drives the narrow-screen stack
  // navigation: the CSS uses [data-view="sidebar"] / [data-view=
  // "list"] / [data-view="editor"] to show one pane at a time on
  // phones (matching Apple Notes' iPhone stack). On wider screens
  // the media query overrides this and shows all three.
  return html`
    <div class="notes-shell" data-view=${store.view}>
      <${Sidebar} store=${store} />
      <${NoteList} store=${store} />
      <${Editor} store=${store} />
      <${Notice} notice=${store.notice} />
    </div>
  `;
}

const root = createRoot(document.getElementById("app"));
root.render(html`<${App} />`);