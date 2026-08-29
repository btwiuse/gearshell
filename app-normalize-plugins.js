// app-normalize-plugins.js — plugin manifest normalization
// (500-line split out of app-normalize.js).

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item)).filter(Boolean);
}

// Mount points must be relative paths inside the task namespace (no
// absolute paths or parent traversal).
function normalizeDst(dst) {
  const d = String(dst || "").trim();
  if (!d) return "";
  if (d.startsWith("/") || d.split("/").includes("..")) return "";
  return d;
}

// wasm: [{ id, dst, src, perm }] — a w9y-hosted wasm binary mounted into
// every task's namespace as a fetch bind (e.g. dst "bin/mytool").
function normalizeWasmList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const src = String(raw?.src || "").trim();
    const dst = normalizeDst(raw?.dst);
    if (!src || !dst) continue;
    out.push({
      id: String(raw?.id || dst).trim() || dst,
      dst,
      src,
      perm: String(raw?.perm || "0755").trim(),
    });
  }
  return out;
}

// preset: [{ id, dst, content, perm }] — an inline file mounted on the
// per-task /preset ramfs (e.g. dst "preset/myrc").
function normalizePresetList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const dst = normalizeDst(raw?.dst);
    if (!dst || typeof raw?.content !== "string") continue;
    out.push({
      id: String(raw?.id || dst).trim() || dst,
      dst,
      content: raw.content,
      perm: String(raw?.perm || "0666").trim(),
    });
  }
  return out;
}

export function normalizePlugin(plugin = {}) {
  const id = String(plugin.id || "").trim();
  if (!id) return null;
  const iframe = plugin?.iframe;
  const iframeSrc = String(iframe?.src || "").trim();
  const wasm = normalizeWasmList(plugin?.wasm);
  const preset = normalizePresetList(plugin?.preset);
  return {
    id,
    name: String(plugin.name || id).trim(),
    version: String(plugin.version || "1.0.0").trim(),
    icon: String(plugin.icon || "Wrench").trim(),
    entry: String(plugin.entry || "").trim(),
    enabled: plugin.enabled !== false,
    // Required plugins (e.g. the shell-tools toolset) cannot be disabled
    // or removed: the config API refuses those writes.
    required: plugin.required === true,
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
    ...(wasm.length ? { wasm } : {}),
    ...(preset.length ? { preset } : {}),
    // Dual-mode w9y dependency: { mod, version? } declares that the
    // package comes from a `w9y mod apply` install (read via the /opfs
    // projection) instead of per-task fetch binds. Preserved so the
    // dependency sync can re-apply on version bumps.
    ...(plugin.w9y && typeof plugin.w9y.mod === "string" && plugin.w9y.mod
      ? {
        w9y: {
          mod: plugin.w9y.mod,
          ...(plugin.w9y.version
            ? { version: String(plugin.w9y.version).trim() }
            : {}),
        },
      }
      : {}),
  };
}

// User config wins by id; built-in defaults fill in the rest, so a
// saved workspace that predates the plugin kernel still boots Music.
// Builtin plugins are kernel-owned: their entry/iframe (file moves and
// version bumps) and their wasm/preset declarations (package content,
// e.g. the bbtex manifest) are refreshed to the current default, so
// saved workspaces pick up plugin updates without a manual reinstall.
// wasm is REPLACED even when the default no longer declares any (the
// dual-mode switch moved bbtex's 63 binaries to a w9y mod dependency),
// so stale per-task fetch binds from older saves are pruned here.
export function normalizePlugins(list, defaults) {
  const defaultsById = new Map(
    (Array.isArray(defaults) ? defaults : [])
      .map(normalizePlugin)
      .filter(Boolean)
      .map((item) => [item.id, item]),
  );
  const user = (Array.isArray(list) ? list : [])
    .map(normalizePlugin)
    .filter(Boolean)
    .map((item) => {
      const def = defaultsById.get(item.id);
      if (!def) return item;
      return {
        ...item,
        entry: def.entry || item.entry,
        ...(def.iframe ? { iframe: def.iframe } : {}),
        wasm: def.wasm || [],
        ...(def.preset ? { preset: def.preset } : {}),
        ...(def.w9y ? { w9y: def.w9y } : {}),
      };
    });
  const userIds = new Set(user.map((item) => item.id));
  const fallback = (Array.isArray(defaults) ? defaults : [])
    .map(normalizePlugin)
    .filter((item) => item && !userIds.has(item.id));
  return [...user, ...fallback];
}
