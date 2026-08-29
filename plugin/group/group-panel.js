// group-panel.js — the Group (About) panel component.
//
// A static image panel with no dependencies. It used to live in the
// root panels.js; it is only used by the group plugin, so it lives with
// the plugin now (one concern per directory).

import React from "react";

export function GroupPanel() {
  return React.createElement(
    "div",
    { className: "group-panel panel-content" },
    React.createElement("img", { src: "group.png", alt: "Gear Shell group" }),
  );
}
