// plugins-scope.js — T1 permission scoping + shell icon resolution
// for the plugin kernel (500-line split out of plugins.js).

import { icons as LucideIcons } from "lucide-react";

// --- Permissions (T1 capability guardrail) ---
// Exported for the iframe bridge (plugins-iframe-api.js): a method path
// must pass the SAME whitelist check the in-page scoped proxy applies.
export function permitsPath(allow, path) {
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
// lucide-react exports icons as forwardRef objects (not plain functions),
// so the truthiness check on LucideIcons[name] is the only safe way to
// discriminate "name exists in the catalog" from "name is missing" —
// `typeof === "function"` always returns false for forwardRef and breaks
// every real icon.
export function resolveIcon(name) {
  const icon = LucideIcons[name];
  return icon || LucideIcons.Wrench;
}
