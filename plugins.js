// plugins.js — the runtime plugin kernel (WISHLIST #9, slice 1).
//
// Third-party tabs arrive as ES modules and register panels with the
// shell at runtime: config.plugins: [{ id, name, version, icon, entry,
// permissions }]. `entry` is a same/cross-origin URL or a vfs:/ path;
// the module exports `register(ctx)` or `plugin.register(ctx)` with ctx:
//   registerPanel({ component, label, icon, title, render, open? })
//   registerSettingsSection({ id, label, render })
//   registerOverlay({ id, render })
//   api — a permission-scoped view of window.GearShell
// Iframe plugins are the entry-less form ({ iframe: { src, ... } }),
// registered synchronously so the boot/restore path can open them
// before any module import resolves. Registration mutates the live
// PANEL_COMPONENTS / PANEL_CREATION_OPTIONS maps and appends unknown
// components to DEFAULT_LAUNCHER_ITEM_ORDER; panels.open and the
// launcher route plugin panels through openPluginPanel. The scoped api
// is a capability guardrail (T1, install = full trust); enforcement
// for untrusted pages (T2 iframe bridge) is a later slice.
//

import { getDockviewApi } from "./app-panels-store.js?v=20260826.148";
import { nextPanelId } from "./app-panel-ids.js?v=20260828.76";
import {
  DEFAULT_LAUNCHER_ITEM_ORDER,
  DEFAULT_PLUGINS,
  STARTUP_PANEL_TYPES,
} from "./app-constants.js?v=20260828.107";
// Split parts (500-line rule): DI shim + change event, permission
// scoping + icon resolution, and entry-module loading.
import {
  emitPluginChanged,
  initPlugins,
  PLUGIN_CHANGED_EVENT,
  pluginsDep,
} from "./plugins-deps.js?v=20260829.97";
import {
  createScopedApi,
  resolveIcon,
} from "./plugins-scope.js?v=20260829.98";
import {
  loadEntryModule,
  registerFnOf,
} from "./plugins-loading.js?v=20260829.99";
import {
  cssLoaded,
  injectPluginCss,
  removePluginCss,
} from "./plugins-css.js?v=20260830.4";
import {
  listOverlays,
  registerOverlay,
  removeOverlaysForPlugin,
} from "./plugins-overlays.js?v=20260830.2";

// Re-export the kernel surface importers keep reading from plugins.js.
export { initPlugins, PLUGIN_CHANGED_EVENT, listOverlays };

// --- Registry state ---
const pluginManifests = new Map(); // id -> normalized manifest
const pluginPanels = new Map(); // component -> { manifest, label, title, render }
const pluginIframes = new Map(); // component -> { manifest, title, src, allow, allowFullscreen }
const pluginLoadResults = new Map(); // id -> { ok, error?, at }

export function getPluginLoadResults() {
  return [...pluginLoadResults.entries()].map(([id, result]) => ({
    id,
    ...result,
  }));
}

export function isPluginPanel(component) {
  return pluginPanels.has(component) || pluginIframes.has(component);
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



// --- Panel registration ---
function ensureLauncherKnown(component) {
  if (!DEFAULT_LAUNCHER_ITEM_ORDER.includes(component)) {
    DEFAULT_LAUNCHER_ITEM_ORDER.push(component);
  }
}

// Plugin panels must survive reloads like built-ins: getSavedOpenPanels
// filters restored panels by STARTUP_PANEL_TYPES, so every registered
// component joins that allow-list (it is a mutable array — the kernel
// appends, never reorders).
function ensureRestorable(component) {
  if (!STARTUP_PANEL_TYPES.includes(component)) {
    STARTUP_PANEL_TYPES.push(component);
  }
}

// Iframe plugins need no JS module: the manifest itself carries the
// iframe src, so registration is synchronous (no import round-trip),
// which also removes the boot race where openStartupPanels / restore
// would miss a panel type that is still loading.
function registerIframePanel(manifest, opts) {
  const component = opts.component || manifest.id;
  const { src, title, allow, allowFullscreen } = opts;
  if (typeof src !== "string" || !src) {
    throw new Error("iframe plugin requires an iframe.src");
  }
  if (pluginIframes.has(component) || pluginPanels.has(component)) {
    throw new Error(`panel type "${component}" already registered`);
  }
  const entry = {
    manifest,
    title: title || manifest.name,
    src,
    allow,
    allowFullscreen,
  };
  pluginIframes.set(component, entry);
  const options = pluginsDep("PANEL_CREATION_OPTIONS");
  if (!options.some((option) => option.component === component)) {
    options.push({
      component,
      label: manifest.name,
      icon: resolveIcon(manifest.icon || "Globe2"),
    });
  }
  ensureLauncherKnown(component);
  ensureRestorable(component);
  return entry;
}

function registerIframePlugin(manifest) {
  injectPluginCss(manifest);
  registerIframePanel(manifest, {
    component: manifest.id,
    ...manifest.iframe,
    title: manifest.name,
  });
  pluginLoadResults.set(manifest.id, { ok: true, at: Date.now() });
  emitPluginChanged({ id: manifest.id, ok: true });
  return { ok: true, id: manifest.id };
}

// Sync half of registerPluginsFromConfig: entry-less iframe manifests
// register immediately (no module import), so they are available to the
// dockview onReady boot path before any panel is opened. Component
// plugins still load asynchronously via registerPluginsFromConfig.
export function registerSyncPlugins() {
  const plugins = pluginsDep("loadConfig")().plugins || [];
  const results = [];
  for (const rawManifest of plugins) {
    const manifest = pluginsDep("normalizePlugin")(rawManifest);
    if (!manifest || !manifest.enabled || !manifest.iframe) continue;
    if (pluginManifests.has(manifest.id)) continue;
    pluginManifests.set(manifest.id, manifest);
    try {
      results.push(registerIframePlugin(manifest));
    } catch (error) {
      results.push(recordPluginFailure(manifest.id, error));
    }
  }
  return results;
}

// Config lookup for the panels.js addPanelByComponent iframe branch.
// Returns the addIframePanel-shaped config ({ title, src, panelType,
// allow, allowFullscreen }) or null when the component is not a
// plugin-provided iframe panel.
export function getPluginIframeConfig(component) {
  const entry = pluginIframes.get(component);
  if (!entry) return null;
  return {
    title: entry.title,
    src: entry.src,
    panelType: component,
    ...(entry.allow ? { allow: entry.allow } : {}),
    ...(entry.allowFullscreen ? { allowFullscreen: true } : {}),
  };
}

// --- Settings sections ---
// Plugins may also contribute settings UI: `registerSettingsSection`
// mirrors registerPanel for the Settings page, letting a plugin's own
// preferences / management UI live inside the shell's settings. The
// section render is a DOM function `(root, ctx) => disposeFn`; ctx.api
// is the same permission-scoped view plugins already get for panels.
// The built-in Plugins link card in Settings registers through this
// same path (see settings-plugins.js), so third parties get a working
// template to copy.

const pluginSettingsSections = new Map(); // id -> { manifest, label, render, ctx }

export function registerSettingsSection(
  manifest,
  { id, label, render },
) {
  if (typeof id !== "string" || !id) {
    throw new Error("settings section requires an id");
  }
  if (typeof label !== "string" || !label) {
    throw new Error(`settings section "${id}" requires a label`);
  }
  if (typeof render !== "function") {
    throw new Error(`settings section "${id}" requires a render function`);
  }
  if (pluginSettingsSections.has(id)) {
    throw new Error(`settings section "${id}" already registered`);
  }
  const entry = {
    manifest,
    label,
    render,
    ctx: {
      manifest,
      api: createScopedApi(
        pluginsDep("workspaceApi"),
        manifest?.permissions?.api,
      ),
    },
  };
  pluginSettingsSections.set(id, entry);
  return entry;
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

// --- Panel registration (component panels) ---
// (overlay registration lives in plugins-overlays.js)

function registerPluginPanel(
  manifest,
  { component, label, icon, title, render, open },
) {
  if (typeof component !== "string" || !component) {
    throw new Error("plugin panel requires a component name");
  }
  if (pluginPanels.has(component)) {
    throw new Error(`panel type "${component}" already registered`);
  }
  if (typeof render !== "function") {
    throw new Error(`panel type "${component}" requires a render component`);
  }
  const entry = {
    manifest,
    label: label || manifest.name,
    title: title || label || manifest.name,
    render,
    // Optional custom panel opener (api, group) => panel, for panels
    // with creation-time behavior the generic opener does not cover
    // (renderer mode, single-instance semantics, open-panel tracking).
    open: typeof open === "function" ? open : null,
  };
  pluginPanels.set(component, entry);
  const components = pluginsDep("PANEL_COMPONENTS");
  components[component] = render;
  const options = pluginsDep("PANEL_CREATION_OPTIONS");
  if (!options.some((option) => option.component === component)) {
    options.push({
      component,
      label: entry.label,
      icon: resolveIcon(icon || "Wrench"),
    });
  }
  ensureLauncherKnown(component);
  return entry;
}

// --- Plugin lifecycle ---

// Shared failure path: drop the manifest, record the load error, emit,
// and hand back the {ok:false} result (used by the sync, async, and
// boot registration paths).
function recordPluginFailure(id, error) {
  pluginManifests.delete(id);
  pluginLoadResults.set(id, {
    ok: false,
    error: error?.message || String(error),
    at: Date.now(),
  });
  emitPluginChanged({ id, ok: false, error: error?.message || String(error) });
  return { ok: false, id, error: error?.message || String(error) };
}

// Load an entry-module plugin and run its register(ctx). The module's
// registerPanel call (or the manifest's iframe field — handled by the
// caller) is what actually creates the panel type.
async function loadComponentPlugin(manifest) {
  const [mod] = await Promise.all([
    loadEntryModule(manifest),
    cssLoaded(injectPluginCss(manifest)),
  ]);
  const register = registerFnOf(mod);
  if (typeof register !== "function") {
    throw new Error(
      "plugin module must export register(ctx) or plugin.register(ctx)",
    );
  }
  const ctx = {
    manifest,
    registerPanel: (opts) => registerPluginPanel(manifest, opts),
    registerSettingsSection: (opts) => registerSettingsSection(manifest, opts),
    registerOverlay: (opts) => registerOverlay(manifest, opts),
    api: createScopedApi(
      pluginsDep("workspaceApi"),
      manifest.permissions?.api,
    ),
  };
  await register(ctx);
  pluginLoadResults.set(manifest.id, { ok: true, at: Date.now() });
  emitPluginChanged({ id: manifest.id, ok: true });
  return { ok: true, id: manifest.id };
}

export async function registerPlugin(rawManifest) {
  const manifest = pluginsDep("normalizePlugin")(rawManifest);
  if (!manifest) return { ok: false, error: "plugin requires an id" };
  if (pluginManifests.has(manifest.id)) {
    return { ok: true, already: true, id: manifest.id };
  }
  pluginManifests.set(manifest.id, manifest);
  // Entry-less iframe manifests register synchronously — no module load.
  // (registerSyncPlugins already did this at boot; this path covers
  // config.plugins.install fired after startup.)
  if (manifest.iframe) {
    try {
      return registerIframePlugin(manifest);
    } catch (error) {
      return recordPluginFailure(manifest.id, error);
    }
  }
  // Tool-only plugins (wasm binaries / preset resources, no UI surface)
  // have nothing to load: the manifest stays registered so its binds are
  // reconciled by ensurePluginToolBinds, but no panel is created.
  if (!manifest.entry) {
    pluginLoadResults.set(manifest.id, { ok: true, at: Date.now() });
    emitPluginChanged({ id: manifest.id, ok: true });
    return { ok: true, id: manifest.id };
  }
  try {
    return await loadComponentPlugin(manifest);
  } catch (error) {
    return recordPluginFailure(manifest.id, error);
  }
}

// Boot: load every enabled plugin from the shell config (the normalized
// config already merges the built-in defaults, so music loads here too).
export async function registerPluginsFromConfig() {
  const plugins = pluginsDep("loadConfig")().plugins || [];
  const results = [];
  for (const manifest of plugins) {
    if (!manifest.enabled) continue;
    results.push(await registerPlugin(manifest));
  }
  return results;
}

// Memoized boot promise: the shell (app-shell's openStartupPanels) awaits
// this before opening startup / restored panels. A startup component whose
// plugin module is still loading would hit dockview with an unregistered
// component name and crash the grid, so the boot path waits for plugin
// registration before adding any panel.
let pluginBootPromise = null;
export function getPluginBootPromise() {
  if (!pluginBootPromise) pluginBootPromise = registerPluginsFromConfig();
  return pluginBootPromise;
}

// Tear down a loaded plugin: drop every panel component it registered
// (component map, launcher entry, launcher order), close any open panels
// of those types, and forget the manifest + load result.
export function unregisterPlugin(id) {
  const manifest = pluginManifests.get(id);
  if (!manifest) {
    return { ok: false, error: `plugin "${id}" is not loaded` };
  }
  const dockview = getDockviewApi();
  // Drop one panel registration (component panel or iframe panel).
  // Close open panels BEFORE dropping the registry entry: a re-render of
  // a still-open panel whose component just vanished would crash the
  // dockview grid.
  const dropRegistration = (component, hasComponentEntry) => {
    for (const panel of dockview?.panels || []) {
      if (panel.params?.panelType === component) panel.api.close();
    }
    // Iframe panels never touch the component map, but every panel type
    // (component or iframe) must leave the creation options + launcher
    // order when its plugin is removed.
    if (hasComponentEntry) {
      delete pluginsDep("PANEL_COMPONENTS")[component];
    }
    const options = pluginsDep("PANEL_CREATION_OPTIONS");
    const index = options.findIndex((option) => option.component === component);
    if (index !== -1) options.splice(index, 1);
    const orderIndex = DEFAULT_LAUNCHER_ITEM_ORDER.indexOf(component);
    if (orderIndex !== -1) DEFAULT_LAUNCHER_ITEM_ORDER.splice(orderIndex, 1);
  };
  for (const [component, entry] of [...pluginPanels]) {
    if (entry.manifest.id !== id) continue;
    dropRegistration(component, true);
    pluginPanels.delete(component);
  }
  for (const [component, entry] of [...pluginIframes]) {
    if (entry.manifest.id !== id) continue;
    dropRegistration(component, false);
    pluginIframes.delete(component);
  }
  for (const [sectionId, entry] of [...pluginSettingsSections]) {
    if (entry.manifest?.id !== id) continue;
    pluginSettingsSections.delete(sectionId);
  }
  removeOverlaysForPlugin(id);
  pluginManifests.delete(id);
  pluginLoadResults.delete(id);
  removePluginCss(id);
  emitPluginChanged({ id, ok: true, unregistered: true });
  return { ok: true, id };
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

// --- Panel opener (routed from addPanelByComponent + panels.open) ---
// The generic opener mints `${component}-<n>` ids and remembers the panel
// for layout persistence, mirroring the built-in add*Panel helpers.
// Plugins that registered a custom `open` (renderer mode, single-instance
// semantics, open-panel tracking) take that path instead.
export function openPluginPanel(api, component, group) {
  const entry = pluginPanels.get(component);
  if (!entry) return null;
  if (entry.open) return entry.open(api, group);
  const id = nextPanelId(component);
  const panel = api.addPanel({
    id,
    component,
    params: { pluginId: id, panelType: component },
    title: entry.title,
    ...(group && { position: { referenceGroup: group } }),
  });
  pluginsDep("rememberOpenPanel")(panel, { component });
  panel.api.setActive();
  return panel;
}
