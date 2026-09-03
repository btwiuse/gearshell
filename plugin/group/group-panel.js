// group-panel.js — the Group (About) panel component.
//
// A static image panel with no dependencies. It used to live in the
// root panels.js; it is only used by the group plugin, so it lives with
// the plugin now (one concern per directory).

import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function GroupPanel() {
  // The image uses `min-width: 0` / `min-height: 0` so the panel's
  // `max-width: 100%` / `max-height: 100%` resolve against the flex
  // container instead of the image's intrinsic size; without that a
  // tall image overflows a short panel because the browser preserves
  // the natural aspect ratio. The className matches the inline
  // stylesheet in plugin/group/index.html so the iframe page and the
  // React panel render identically.
  return html`
    <div className="group-panel panel-content">
      <img src=${new URL("group.png", import.meta.url).href} alt="Gear Shell group"/>
    </div>
  `;
}
