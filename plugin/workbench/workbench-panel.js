// workbench-panel.js — the Workbench panel component.
//
// Lives with the workbench plugin (it is only used there); the custom
// opener (addWorkbenchPanel, single-instance semantics) stays in the
// root panels.js because the saved-tab restore path (app-panels
// addRestoredPanel) calls it directly.

import React, { useEffect, useRef } from "react";
import htm from "htm";
import { panelsDep } from "../../panels.js?v=20260812.124";

const html = htm.bind(React.createElement);

export function WorkbenchPanel({ api, params }) {
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
  return html`<div ref=${wrapperRef} className="panel-content"></div>`;
}
