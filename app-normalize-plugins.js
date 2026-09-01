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

// files: [{ id, dst, src, perm }] — a fetched resource mounted into every
// task namespace as a fetch bind (e.g. dst "examples/hello.js" pointing at
// a same-origin URL). Like wasm, but for non-binary resources: no /bin
// parent mount, default perm 0666.
function normalizeFilesList(list) {
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
      perm: String(raw?.perm || "0666").trim(),
    });
  }
  return out;
}

// Dual-mode w9y dependency: { mod, version? } declares that the package
// comes from a `w9y mod apply` install (read via the /opfs projection)
// instead of per-task fetch binds. Preserved so the dependency sync can
// re-apply on version bumps.
function normalizeW9yDependency(plugin) {
  if (!plugin.w9y || typeof plugin.w9y.mod !== "string" || !plugin.w9y.mod) {
    return null;
  }
  return {
    w9y: {
      mod: plugin.w9y.mod,
      ...(plugin.w9y.version
        ? { version: String(plugin.w9y.version).trim() }
        : {}),
    },
  };
}

export function normalizePlugin(plugin = {}) {
  const id = String(plugin.id || "").trim();
  if (!id) return null;
  const iframe = plugin?.iframe;
  const iframeSrc = String(iframe?.src || "").trim();
  const wasm = normalizeWasmList(plugin?.wasm);
  const preset = normalizePresetList(plugin?.preset);
  const files = normalizeFilesList(plugin?.files);
  const systemFiles = normalizeFilesList(plugin?.systemFiles);
  const css = normalizeStringList(plugin?.css);
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
    ...(files.length ? { files } : {}),
    // systemFiles: fetched resources mounted into the SYSTEM root
    // namespace, not the per-task namespace. The kernel's js driver reads
    // worker scripts from the root (not the task ns), so js workers must
    // ship here; the wasi/gojs drivers read the task ns, which clones the
    // root, so system mounts are visible to them as well.
    ...(systemFiles.length ? { systemFiles } : {}),
    ...(normalizeW9yDependency(plugin) || {}),
    // Plugin stylesheet paths (same-origin, unversioned like every other
    // local module; rely on HTTP cache headers and DevTools "Disable
    // cache" during iteration instead of cache-bust tokens).
    ...(css.length ? { css } : {}),
    // Opt-in flag for the empty-workspace fallback (see plugins.js
    // getEmptyGridPanel). Lives on the manifest, not under iframe,
    // because both component and iframe plugins opt in the same way.
    ...(plugin.emptyGrid === true ? { emptyGrid: true } : {}),
  };
}

// User config wins by id; built-in defaults fill in the rest, so a
// saved workspace that predates the plugin kernel still boots Music.
// Builtin plugins are kernel-owned: their entry/iframe (file moves and
// version bumps) and their wasm/preset declarations (package content,
// e.g. the bbtex manifest) are refreshed to the current default, so
// saved workspaces pick up plugin updates without a manual reinstall.
// wasm/files/systemFiles are REPLACED even when the default no longer
// declares any (the dual-mode switch moved bbtex's 63 binaries to a w9y
// mod dependency), so stale per-task fetch binds from older saves are
// pruned here.
export function normalizePlugins(list, defaults) {
  const defaultsById = new Map(
    (Array.isArray(defaults) ? defaults : [])
      .map(normalizePlugin)
      .filter(Boolean)
      .map((item) => [item.id, item]),
  );
  const user = (Array.isArray(list) ? list : [])
    .map(normalizePlugin)
    .filter((item) => item && item.id !== "vm")
    .map((item) => {
      const def = defaultsById.get(item.id);
      if (!def) return item;
      return {
        ...item,
        // Content version rides the same refresh as content: the OPFS
        // bind cache keys on <pluginId>@<version>, so a manifest version
        // bump must land in the saved config or the cache keeps serving
        // stale bytes under the old key.
        name: def.name || item.name,
        version: def.version || item.version,
        entry: def.entry !== undefined ? def.entry : item.entry,
        ...(def.iframe ? { iframe: def.iframe } : {}),
        // permissions ride the same refresh as iframe src: a builtin
        // plugin's API surface is a property of the shipped manifest, so
        // workspace-saved copies must not freeze an old whitelist.
        ...(def.permissions ? { permissions: def.permissions } : {}),
        wasm: def.wasm || [],
        ...(def.preset ? { preset: def.preset } : {}),
        // files/systemFiles are REPLACED even when the default no longer
        // declares any (mirroring wasm): stale per-task or system fetch
        // binds from older saves are pruned by the reconcile pass.
        files: def.files || [],
        systemFiles: def.systemFiles || [],
        ...(def.w9y ? { w9y: def.w9y } : {}),
        css: def.css || [],
        // emptyGrid is a manifest-only opt-in (not user-editable): the
        // boot-time plugin kernel reads it from the manifest, so the
        // default must always win even when the user has never saved
        // this plugin id (first boot) or saved a stale version.
        emptyGrid: def.emptyGrid === true,
      };
    });
  const userIds = new Set(user.map((item) => item.id));
  const fallback = (Array.isArray(defaults) ? defaults : [])
    .map(normalizePlugin)
    .filter((item) => item && !userIds.has(item.id));
  return [...user, ...fallback];
}
