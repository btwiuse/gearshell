// template-overlay.js — the Plugin Template overlay.
//
// registerOverlay render contract: a null-rendering React component
// mounted beside the dockview grid (desktop-pet style, see
// app-shell's PluginOverlays). Render nothing heavy; a small status
// pill like this one is the typical shape. It re-mounts whenever the
// plugin kernel changes (enable/disable/install).

import React from "react";

export function TemplateOverlay() {
  return React.createElement(
    "div",
    {
      className: "template-overlay",
      title: "Plugin Template — overlay demo (registerOverlay)",
    },
    "TPL",
  );
}
