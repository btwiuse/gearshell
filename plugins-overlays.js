// plugins-overlays.js — shell overlay registration (500-line rule split
// out of plugins.js). Ambient shell chrome (a desktop pet, a chat widget,
// a status pill) is a third registration kind: registerOverlay mounts a
// null-rendering React component at the top of the shell, beside the
// dockview grid. The built-in Wagi Dog pet and Discord widget load this
// way (their config flags still decide visibility; the plugin manifest
// decides availability), and any third party can contribute the same.

const pluginOverlays = new Map(); // id -> { manifest, render }

// Overlay-hosted iframe sources. An overlay may render an iframe instead
// of in-page DOM (the Spotlight launcher does), and the postMessage
// bridge whitelists senders by matching the <iframe> element's src
// against registered plugin iframes. Overlay iframes are not panels, so
// they need their own registry entry to be reachable by that check —
// declare it with registerOverlay({ iframe: { src } }).
const overlayIframes = new Map(); // src -> manifest

export function registerOverlay(manifest, { id, render, iframe, props }) {
  if (typeof id !== "string" || !id) {
    throw new Error("overlay requires an id");
  }
  if (typeof render !== "function") {
    throw new Error(`overlay "${id}" requires a render component`);
  }
  if (pluginOverlays.has(id)) {
    throw new Error(`overlay "${id}" already registered`);
  }
  const entry = { manifest, render, props };
  pluginOverlays.set(id, entry);
  if (iframe?.src) overlayIframes.set(iframe.src, manifest);
  return entry;
}

// Bridge lookup: the overlay iframe src -> { component, src, manifest },
// shaped like listPluginIframes() so plugins-iframe-api.js can treat
// both registries the same way.
export function listOverlayIframes() {
  return [...overlayIframes.entries()].map(([src, manifest]) => ({
    component: manifest?.id || src,
    src,
    manifest,
  }));
}

// Overlays for the shell chrome (rendered by app-shell's PluginOverlays,
// which re-renders on PLUGIN_CHANGED_EVENT so async plugin loads show up).
export function listOverlays() {
  return [...pluginOverlays.entries()].map(([id, entry]) => ({
    id,
    render: entry.render,
    props: entry.props,
  }));
}

// Drop every overlay a plugin registered (unregisterPlugin teardown).
export function removeOverlaysForPlugin(id) {
  for (const [overlayId, entry] of [...pluginOverlays]) {
    if (entry.manifest?.id !== id) continue;
    pluginOverlays.delete(overlayId);
  }
  for (const [src, manifest] of [...overlayIframes]) {
    if (manifest?.id === id) overlayIframes.delete(src);
  }
}
