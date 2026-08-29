// plugins.js — the runtime plugin kernel (WISHLIST #9, slice 1).
//
// Third-party tabs arrive as ES modules and register panels with the
// shell at runtime:
//
//   config.plugins: [{ id, name, version, icon, entry, permissions }]
//
//   entry:  "https://host/plugin.js"  cross-origin URL (needs CORS)
//           "/plugin.js"              same-origin URL
//           "vfs:/opfs/plugins/x.js"  Wanix VFS file (readFile -> blob)
//
//   module contract: `export function register(ctx)` or
//                    `export const plugin = { register(ctx) }`; ctx is:
//                      registerPanel({ component, label, icon, title, render })
//                      registerSettingsSection({ id, label, render })
//                      registerOverlay({ id, render })
//                      api — a permission-scoped view of window.GearShell
//   Settings sections are DOM render functions `(root, ctx) => dispose`
//   mounted by the Settings panel; overlays are null-rendering React
//   components mounted beside the dockview grid (ambient shell chrome).
//
//   Iframe plugins are the entry-less form: `{ ..., iframe: { src,
//   allow?, allowFullscreen? } }` registers a panel that hosts the src in
//   a sandboxed iframe. Registration is synchronous (no module import),
//   so iframe plugins are available to the boot/restore path immediately
//   (registerSyncPlugins runs before dockview onReady). The shell's own
//   Browser / Bonsai / Codigo / Crush / Rick Roll tabs are built-ins of
//   this kind — the same manifests any third party would write.
//
// Registration mutates the live PANEL_COMPONENTS / PANEL_CREATION_OPTIONS
// maps (dockview resolves components by name at addPanel time, so new
// panel types are visible immediately) and appends unknown components to
// DEFAULT_LAUNCHER_ITEM_ORDER so launcher normalization keeps them.
// `panels.open("<component>")` and the launcher route plugin panels
// through openPluginPanel.
//
// The scoped api is a capability guardrail (T1): an in-page plugin
// shares the shell's JS context, so install is full trust. Real
// enforcement for untrusted pages (T2, iframe bridge) is a later slice.

import { icons as LucideIcons } from "lucide-react";
import { getDockviewApi } from "./app-panels-store.js?v=20260826.68";
import { nextPanelId } from "./app-panel-ids.js?v=20260828.76";
import {
  DEFAULT_LAUNCHER_ITEM_ORDER,
  DEFAULT_PLUGINS,
  STARTUP_PANEL_TYPES,
} from "./app-constants.js?v=20260828.27";
import { pushEvent } from "./workspace-events.js?v=20260828.4";

// Fired whenever a plugin finishes loading (ok or failed) or is
// unregistered; the Settings plugins section re-renders on it.
export const PLUGIN_CHANGED_EVENT = "GearShellPluginsChanged";

function emitPluginChanged(payload) {
  window.dispatchEvent(
    new CustomEvent(PLUGIN_CHANGED_EVENT, { detail: payload || {} }),
  );
  pushEvent("plugins.changed", payload || {});
}

let __pluginsDeps = null;
export function initPlugins(dependencies) {
  __pluginsDeps = dependencies;
}
function pluginsDep(name) {
  if (__pluginsDeps == null) {
    throw new Error(
      "plugins: initPlugins() has not been called; ensure app.js wires it in.",
    );
  }
  const value = __pluginsDeps[name];
  if (value === undefined) {
    throw new Error(`plugins: missing dependency ${name}`);
  }
  return value;
}

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

// --- Permissions (T1 capability guardrail) ---
function permitsPath(allow, path) {
  return allow.some((pattern) => {
    if (pattern === "*" || pattern === path) return true;
    if (pattern.endsWith(".*") && path.startsWith(pattern.slice(0, -1))) {
      return true;
    }
    return false;
  });
}

function denied(path) {
  return { ok: false, error: `permission denied: ${path}` };
}

// A Proxy over the workspace api that resolves dotted paths
// (config.providers.save) and refuses anything not in the allow list
// with a safe-style {ok:false} result.
export function createScopedApi(api, allow = []) {
  const rules = Array.isArray(allow) ? allow.map(String).filter(Boolean) : [];
  const scoped = (target, prefix) =>
    new Proxy(target, {
      get(obj, key) {
        if (key === "then") return undefined; // keep Proxies thenable-safe
        const value = obj[key];
        if (typeof value === "function") {
          const path = prefix + key;
          return (
            ...args
          ) => (permitsPath(rules, path) ? value(...args) : denied(path));
        }
        if (value && typeof value === "object") {
          return scoped(value, prefix + key + ".");
        }
        return value;
      },
    });
  return scoped(api, "");
}

// --- Icon resolution (shell-side lucide catalog, plugins never bundle icons) ---
function resolveIcon(name) {
  const icon = LucideIcons[name];
  return typeof icon === "function" ? icon : LucideIcons.Wrench;
}

// --- Loading ---
function entryUrl(entry) {
  if (/^https?:\/\//i.test(entry)) return entry;
  if (entry.startsWith("/")) return entry;
  return null;
}

function vfsPath(entry) {
  if (entry.startsWith("vfs:")) return entry.slice(4);
  return null;
}

// Load the plugin entry module. URL entries import directly (relative
// sub-imports resolve against the URL; bare specifiers use the page
// importmap, so plugins share the shell's React instance). VFS entries
// become blob URLs: single-file only, no relative sub-imports.
async function loadEntryModule(manifest) {
  const url = entryUrl(manifest.entry, manifest.version);
  if (url) {
    const target = url.includes("?") ? url : `${url}?v=${manifest.version}`;
    return import(target);
  }
  const path = vfsPath(manifest.entry);
  if (path) {
    const root = pluginsDep("getWanixRoot")();
    if (!root) {
      throw new Error("wanix is not ready; cannot read plugin entry");
    }
    const data = await root.readFile(path);
    const blobUrl = URL.createObjectURL(
      new Blob([data], { type: "text/javascript" }),
    );
    try {
      return await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  throw new Error(
    "entry must be an http(s) URL, a /same-origin path, or a vfs:/... path",
  );
}

function registerFnOf(mod) {
  if (typeof mod?.register === "function") return mod.register;
  if (typeof mod?.plugin?.register === "function") return mod.plugin.register;
  if (typeof mod?.default?.register === "function") {
    return mod.default.register;
  }
  return null;
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

// --- Shell overlays ---
// Ambient shell chrome (a desktop pet, a chat widget, a status pill) is
// a third registration kind: `registerOverlay` mounts a null-rendering
// React component at the top of the shell, beside the dockview grid.
// The built-in Wagi Dog pet and Discord widget load this way (their
// config flags still decide visibility; the plugin manifest decides
// availability), and any third party can contribute the same.
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

function registerPluginPanel(
  manifest,
  { component, label, icon, title, render },
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
  const mod = await loadEntryModule(manifest);
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
  for (const [overlayId, entry] of [...pluginOverlays]) {
    if (entry.manifest?.id !== id) continue;
    pluginOverlays.delete(overlayId);
  }
  pluginManifests.delete(id);
  pluginLoadResults.delete(id);
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
export function openPluginPanel(api, component, group) {
  const entry = pluginPanels.get(component);
  if (!entry) return null;
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
