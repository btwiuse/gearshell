// group-panel.js — the Group (About) panel component.
//
// A static image panel with no dependencies. It used to live in the
// root panels.js; it is only used by the group plugin, so it lives with
// the plugin now (one concern per directory).

import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function GroupPanel() {
  return html`
    <div className="group-panel panel-content">
      <img src=${new URL("group.png", import.meta.url).href} alt="Gear Shell group"/>
    </div>
  `;
}
