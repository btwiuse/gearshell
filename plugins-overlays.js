// plugins-overlays.js — shell overlay registration (500-line rule split
// out of plugins.js). Ambient shell chrome (a desktop pet, a chat widget,
// a status pill) is a third registration kind: registerOverlay mounts a
// null-rendering React component at the top of the shell, beside the
// dockview grid. The built-in Wagi Dog pet and Discord widget load this
// way (their config flags still decide visibility; the plugin manifest
// decides availability), and any third party can contribute the same.

const pluginOverlays = new Map(); // id -> { manifest, render }

export function registerOverlay(manifest, { id, render }) {
  if (typeof id !== "string" || !id) {
    throw new Error("overlay requires an id");
  }
  if (typeof render !== "function") {
    throw new Error(`overlay "${id}" requires a render component`);
  }
  if (pluginOverlays.has(id)) {
    throw new Error(`overlay "${id}" already registered`);
  }
  const entry = { manifest, render };
  pluginOverlays.set(id, entry);
  return entry;
}

// Overlays for the shell chrome (rendered by app-shell's PluginOverlays,
// which re-renders on PLUGIN_CHANGED_EVENT so async plugin loads show up).
export function listOverlays() {
  return [...pluginOverlays.entries()].map(([id, entry]) => ({
    id,
    render: entry.render,
  }));
}

// Drop every overlay a plugin registered (unregisterPlugin teardown).
export function removeOverlaysForPlugin(id) {
  for (const [overlayId, entry] of [...pluginOverlays]) {
    if (entry.manifest?.id !== id) continue;
    pluginOverlays.delete(overlayId);
  }
}
