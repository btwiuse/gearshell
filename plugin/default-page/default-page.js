// default-page.js — the empty-workspace landing panel.
//
// A single card, centered, that does three things:
//   1. Tells the user the hotkey to open Spotlight (so they know what
//      to do even if they never see the launcher plugin).
//   2. Lists the few apps that benefit from a one-click launch
//      (Terminal, Files, Settings, Home). The list is fixed: the
//      full app catalog already lives behind Spotlight.
//   3. Listens for `addPanelByComponent` through the containerApi
//      dockview passes in, so a click opens a tab in the same group.

import React, { useEffect } from "react";
import htm from "htm";
import { Terminal as TerminalIcon, Folder as FolderIcon, Settings as SettingsIcon, Home as HomeIcon } from "lucide-react";

const html = htm.bind(React.createElement);

const QUICK_LAUNCHES = [
  { component: "console", label: "Console", Icon: TerminalIcon },
  { component: "files", label: "Files", Icon: FolderIcon },
  { component: "home", label: "Home", Icon: HomeIcon },
  { component: "settings", label: "Settings", Icon: SettingsIcon },
];

// Click handler: open the target component on the same dockview
// group. Use the workspace API (window.GearShell.panels.open) so we
// go through the same kernel dispatch that Spotlight and the
// launcher-menu "+" button use — that handles plugin panels, the
// custom openers (terminal needs a profile, terminalId, etc.), and
// panel-id minting in one place. The component goes onto the active
// group because that's the user-visible dockview surface.
function openComponent(_containerApi, component) {
  const api = typeof window !== "undefined" ? window.GearShell : null;
  if (!api?.panels?.open) return;
  api.panels.open(component);
}

function DefaultPage({ containerApi }) {
  // Keyboard hint: pressing the hotkey still works while focus is in
  // the panel because the host listens on window.
  useEffect(() => {
    const card = document.querySelector(".default-page-card");
    if (card) card.focus({ preventScroll: true });
  }, []);
  return html`
    <div className="default-page panel-content">
      <div className="default-page-card" tabIndex=${-1}>
        <h1 className="default-page-title">Empty workspace</h1>
        <p className="default-page-hint">
          Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> to open Spotlight.
        </p>
        <ul className="default-page-launches">
          ${QUICK_LAUNCHES.map(({ component, label, Icon }) => html`
            <li key=${component}>
              <button
                type="button"
                className="default-page-launch"
                onClick=${() => openComponent(containerApi, component)}
              >
                <${Icon} size=${16} aria-hidden=${true}/>
                <span>${label}</span>
              </button>
            </li>
          `)}
        </ul>
      </div>
    </div>
  `;
}

export { DefaultPage };