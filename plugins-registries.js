// plugins-registries.js — the plugin-kernel Maps + their pure readers.
// Split out of plugins.js for the 500-line rule: registries hold no
// behavior, only state, so this module is read-only state plus the
// lookups other modules use to answer "what's loaded?". Mutation lives
// in plugins.js (registration) and plugins-overlays.js (overlay entries);
// both modules reach into these Maps directly because they are the
// canonical store.

import { DEFAULT_PLUGINS } from "./app-constants.js";

// id -> normalized manifest. The kernel never reads the raw config —
// manifests here are already normalized (id/iframe/entry/w9y/wasm).
export const pluginManifests = new Map();

// component -> { manifest, label, title, render, open, emptyGrid }.
// Component panels mount a React renderer registered by the plugin's
// entry module.
export const pluginPanels = new Map();

// component -> { manifest, title, src, allow, allowFullscreen, emptyGrid }.
// Iframe panels host a sandboxed iframe at `src`; no entry module.
export const pluginIframes = new Map();

// id -> { ok, error?, at }. Last load result per plugin id. Survives
// reloads (config restore) so the Plugins page can show "loaded" /
// "failed: <msg>" status without re-running registration.
export const pluginLoadResults = new Map();

// id -> { manifest, label, render, ctx }. Plugin-contributed Settings
// cards, mounted after the built-in Settings template content.
export const pluginSettingsSections = new Map();

export function getPluginLoadResults() {
  return [...pluginLoadResults.entries()].map(([id, result]) => ({
    id,
    ...result,
  }));
}

export function isPluginPanel(component) {
  return pluginPanels.has(component) || pluginIframes.has(component);
}

// Empty-grid fallback lookup. First enabled { emptyGrid: true }
// entry wins across both registries; disabled providers skipped so
// toggling in the Plugins page changes the default without code.
export function getEmptyGridPanel() {
  for (const [component, entry] of pluginPanels) {
    if (!entry.emptyGrid) continue;
    if (entry.manifest?.enabled === false) continue;
    return { component, open: entry.open || null };
  }
  for (const [component, entry] of pluginIframes) {
    if (!entry.emptyGrid) continue;
    if (entry.manifest?.enabled === false) continue;
    return { component, open: null };
  }
  return null;
}

export function listPluginPanels() {
  return [
    ...[...pluginPanels.entries()].map(([component, entry]) => ({
      component,
      label: entry.label,
      pluginId: entry.manifest.id,
    })),
    ...[...pluginIframes.entries()].map(([component, entry]) => ({
      component,
      label: entry.title,
      pluginId: entry.manifest.id,
    })),
  ];
}

// Iframe plugin registry snapshot (component -> { src, manifest }),
// consumed by the iframe bridge (plugins-iframe-api.js) to whitelist
// sender origins against registered iframe srcs.
export function listPluginIframes() {
  return [...pluginIframes.entries()].map(([component, entry]) => ({
    component,
    src: entry.src,
    manifest: entry.manifest,
  }));
}

// Config lookup for the panels.js addPanelByComponent iframe branch.
// Returns the addIframePanel-shaped config ({ title, src, panelType,
// allow, allowFullscreen }) or null when the component is not a
// plugin-provided iframe panel.
export function getPluginIcon(component) {
  return pluginPanels.get(component)?.manifest?.icon || pluginIframes.get(component)?.manifest?.icon || null;
}

export function getPluginIframeConfig(component) {
  const entry = pluginIframes.get(component);
  if (!entry) return null;
  return {
    title: entry.title,
    src: entry.src,
    icon: entry.manifest.icon,
    panelType: component,
    ...(entry.allow ? { allow: entry.allow } : {}),
    ...(entry.allowFullscreen ? { allowFullscreen: true } : {}),
    // Deep-link routes for Spotlight. The kernel turns `route=<name>`
    // in `options` into the matching query string on the iframe URL.
    // Routes are filtered+deduped at the catalog layer; we just
    // surface whatever the manifest declared.
    ...(Array.isArray(entry.manifest?.routes) ? { routes: entry.manifest.routes } : {}),
    // Iframe plugins with a w9y dep install lazily on first open
    // (see addIframePanel in panels.js). ensureW9yDependencies skips
    // iframe plugins on boot so the install cost is paid only when
    // the user actually opens the panel — the page renders an
    // "install on first run" affordance if the registry still shows
    // missing when it mounts. Pinned-version parity with the boot
    // path is preserved: the apply uses dep.version when set.
    ...(entry.manifest?.w9y ? { w9y: entry.manifest.w9y } : {}),
  };
}

// Ordered (insertion-ordered) list of registered settings sections for
// the Settings panel to mount after its built-in template content.
export function listSettingsSections() {
  return [...pluginSettingsSections.entries()].map(([id, entry]) => ({
    id,
    label: entry.label,
    render: entry.render,
    ctx: entry.ctx,
  }));
}

// Merge the kernel's live load status onto a config manifest (the
// config.plugins.list view). Missing status = not loaded (disabled or
// failed before the kernel tracked it).
export function mergePluginStatus(manifest) {
  const result = pluginLoadResults.get(manifest.id);
  return {
    ...manifest,
    builtin: (DEFAULT_PLUGINS || []).some((item) => item.id === manifest.id),
    loaded: pluginManifests.has(manifest.id),
    loadError: result && !result.ok ? result.error : null,
    loadAt: result?.at ?? null,
    panels: [
      ...[...pluginPanels.entries()]
        .filter(([, entry]) => entry.manifest.id === manifest.id)
        .map(([component]) => component),
      ...[...pluginIframes.entries()]
        .filter(([, entry]) => entry.manifest.id === manifest.id)
        .map(([component]) => component),
    ],
  };
}
