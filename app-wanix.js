// Wanix system bootstrap elements: wanix-bind element builder and the
// wanix-namespace system root (500-line rule split).

import { WANIX_RUNTIME } from "./app-constants.js?v=20260828.100";
import { loadActiveWorkspace } from "./app-workspace.js?v=20260826.141";
import { html } from "./dom-html.js?v=20260830.3";

export function createWanixBindElement(bind) {
  return html`<wanix-bind
    type=${bind.type && bind.type !== "ns" ? bind.type : null}
    dst=${bind.dst}
    src=${bind.src || null}
    perm=${bind.mode || null}
    union=${bind.union || null}
  >${bind.content || null}</wanix-bind>`;
}

export function createWanixSystem(workspace = loadActiveWorkspace()) {
  const host = document.getElementById("wanix-host");
  if (!host) throw new Error("Unable to find the Wanix host.");
  const system = html`<wanix-namespace
    id="wanix-system"
    wasm=${workspace.runtime.wasmUrl || WANIX_RUNTIME.wasmUrl}
    allow-origins=${workspace.system.allowOrigins || null}
  />`;

  system.append(
    html`<div id="app-root"/>`,
    html`<div id="terminal-layer"/>`,
  );
  for (const bind of workspace.system.binds) {
    system.appendChild(createWanixBindElement(bind));
  }
  host.replaceChildren(system);
  return system;
}

// wanix elements inside dockview need an explicit system reference because
// Dockview isolates panel content from the Wanix namespace ancestor.
