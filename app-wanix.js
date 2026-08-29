// Wanix system bootstrap elements: wanix-bind element builder and the
// wanix-namespace system root (500-line rule split).

import { WANIX_RUNTIME } from "./app-constants.js?v=20260828.26";
import { loadActiveWorkspace } from "./app-workspace.js?v=20260826.67";

export function createWanixBindElement(bind) {
  const element = document.createElement("wanix-bind");
  if (bind.type && bind.type !== "ns") element.setAttribute("type", bind.type);
  element.setAttribute("dst", bind.dst);
  if (bind.src) element.setAttribute("src", bind.src);
  if (bind.mode) element.setAttribute("perm", bind.mode);
  if (bind.union) element.setAttribute("union", bind.union);
  if (bind.content) element.textContent = bind.content;
  return element;
}

export function createWanixSystem(workspace = loadActiveWorkspace()) {
  const host = document.getElementById("wanix-host");
  if (!host) throw new Error("Unable to find the Wanix host.");
  const system = document.createElement("wanix-namespace");
  system.id = "wanix-system";
  system.setAttribute(
    "wasm",
    workspace.runtime.wasmUrl || WANIX_RUNTIME.wasmUrl,
  );
  if (workspace.system.allowOrigins) {
    system.setAttribute("allow-origins", workspace.system.allowOrigins);
  }

  const appRoot = document.createElement("div");
  appRoot.id = "app-root";
  const terminalLayer = document.createElement("div");
  terminalLayer.id = "terminal-layer";
  system.append(appRoot, terminalLayer);
  for (const bind of workspace.system.binds) {
    system.appendChild(createWanixBindElement(bind));
  }
  host.replaceChildren(system);
  return system;
}

// wanix elements inside dockview need an explicit system reference because
// Dockview isolates panel content from the Wanix namespace ancestor.
