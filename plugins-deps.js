// plugins-deps.js — the plugin kernel's DI shim + change event
// (500-line split out of plugins.js).

import { emit } from "./workspace-events.js";

export const PLUGIN_CHANGED_EVENT = "GearShellPluginsChanged";

export function emitPluginChanged(payload) {
  window.dispatchEvent(
    new CustomEvent(PLUGIN_CHANGED_EVENT, { detail: payload || {} }),
  );
  // emit (not pushEvent) so the iframe plugin bridge forwards the
  // notification to every subscribed plugin. pushEvent only writes
  // to the agent ring buffer, leaving iframe events.on("plugins.changed")
  // listeners (App Store, Settings Apps tab, etc.) silently dead.
  // Plugin install/toggle/remove fires this on user action, so the
  // low frequency is safe for in-memory fan-out.
  emit("plugins.changed", payload || {});
}

let __pluginsDeps = null;
export function initPlugins(dependencies) {
  __pluginsDeps = dependencies;
}
export function pluginsDep(name) {
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
