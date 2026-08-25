// Shared mutable session state for the app entry and session modules
// (500-line rule split). Kept dependency-free so imports cannot cycle.

export let terminalLayer = null;
export function setTerminalLayer(value) {
  terminalLayer = value;
}
export const terminalSessions = new Map();
export const workspaceTaskSessions = new Map();
export const iframeSessions = new Map();
export const vmSessions = new Map();
export const workbenchSessions = new Map();
export const vmDriverInstallations = new Map();
export let systemReady = false;
export function setSystemReady(value) {
  systemReady = value;
}
export let wanixSystem = null;
export function setWanixSystem(value) {
  wanixSystem = value;
}

export function getWanixRoot() {
  if (!systemReady || !wanixSystem?.root) {
    throw new Error("Wanix system is still starting.");
  }
  return wanixSystem.root;
}
