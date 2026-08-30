// vm-panel.js — the VM panel component.
//
// Lives with the vm plugin (it is only used there); the custom opener
// (addVmPanel) stays in the root panels.js because the saved-tab
// restore path (app-panels addRestoredPanel) calls it directly.

import React, { useEffect, useRef } from "react";
import htm from "htm";
import { panelsDep } from "../../panels.js?v=20260812.136";

const html = htm.bind(React.createElement);

export function VmPanel({ api, params }) {
  const wrapperRef = useRef(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return panelsDep("attachVmSession")(
      params.vmId,
      params.config || panelsDep("getVmPanelConfig")(),
      wrapper,
      api,
    );
  }, [api, params.vmId]);
  return html`<div ref=${wrapperRef} className="panel-content"></div>`;
}
