// app-normalize-plugins.js — plugin manifest normalization
// (500-line split out of app-normalize.js).

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item)).filter(Boolean);
}

export function normalizePlugin(plugin = {}) {
  const id = String(plugin.id || "").trim();
  if (!id) return null;
  const iframe = plugin?.iframe;
  const iframeSrc = String(iframe?.src || "").trim();
  return {
    id,
    name: String(plugin.name || id).trim(),
    version: String(plugin.version || "1.0.0").trim(),
    icon: String(plugin.icon || "Wrench").trim(),
    entry: String(plugin.entry || "").trim(),
    enabled: plugin.enabled !== false,
    permissions: {
      api: normalizeStringList(plugin.permissions?.api),
      origins: normalizeStringList(plugin.permissions?.origins),
    },
    ...(iframeSrc
      ? {
        iframe: {
          src: iframeSrc,
          ...(iframe.allow ? { allow: String(iframe.allow).trim() } : {}),
          ...(iframe.allowFullscreen ? { allowFullscreen: true } : {}),
        },
      }
      : {}),
  };
}

// User config wins by id; built-in defaults fill in the rest, so a
// saved workspace that predates the plugin kernel still boots Music.
export function normalizePlugins(list, defaults) {
  const user = (Array.isArray(list) ? list : [])
    .map(normalizePlugin)
    .filter(Boolean);
  const userIds = new Set(user.map((item) => item.id));
  const fallback = (Array.isArray(defaults) ? defaults : [])
    .map(normalizePlugin)
    .filter((item) => item && !userIds.has(item.id));
  return [...user, ...fallback];
}
