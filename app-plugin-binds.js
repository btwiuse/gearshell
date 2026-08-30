// app-plugin-binds.js — plugin-declared wasm binaries + preset resources.
// Plugins may declare `wasm: [{id, dst, src}]` (a w9y-hosted binary to
// mount into every task's namespace as a fetch bind, like the kernel's
// task-bash/task-w9y) and `preset: [{id, dst, content}]` (an inline rc
// file on the per-task /preset ramfs). ensurePluginToolBinds reconciles
// those declarations into workspace.binds, mirroring how
// ensureTaskShellBinds (gear-bind.js) manages the kernel shell toolset —
// but the plugin version is self-sufficient: it also provides the /bin
// and /preset ramfs mounts when nothing else does.

import {
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.146";

// Plugin-owned binds carry this prefix; ensurePluginToolBinds prunes any
// bind with it that no enabled plugin declares (disable / remove / config
// edit all converge on the same reconciliation).
const PLUGIN_BIND_PREFIX = "plugin-";

function bindIdFor(pluginId, kind, toolId) {
  return `${PLUGIN_BIND_PREFIX}${pluginId}-${kind}-${toolId}`;
}

// One wasm declaration -> managed fetch bind (+ /bin parent need). The
// map is keyed by DST so two plugins claiming the same mount point do not
// produce duplicate binds: the first declaration (config order is
// user-first, then defaults) wins, so a user install overrides a
// default's same dst.
function collectPluginWasm(managed, need, plugin) {
  for (const wasm of plugin.wasm || []) {
    if (managed.has(wasm.dst)) continue;
    managed.set(wasm.dst, {
      id: bindIdFor(plugin.id, "wasm", wasm.id),
      type: "fetch",
      dst: wasm.dst,
      src: wasm.src,
      perm: wasm.perm || "0755",
    });
    if (wasm.dst.startsWith("bin/") || wasm.dst === "bin") need.bin = true;
  }
}

// One preset declaration -> managed file bind (+ /preset parent need).
function collectPluginPreset(managed, need, plugin) {
  for (const preset of plugin.preset || []) {
    if (managed.has(preset.dst)) continue;
    managed.set(preset.dst, {
      id: bindIdFor(plugin.id, "preset", preset.id),
      type: "file",
      dst: preset.dst,
      perm: preset.perm || "0666",
      content: preset.content,
    });
    if (preset.dst.startsWith("preset") || preset.dst === "preset") {
      need.preset = true;
    }
  }
}

// Collect the managed bind map for the enabled plugins: dst -> bind.
export function collectPluginBinds(plugins) {
  const managed = new Map();
  const ns = [];
  const need = { preset: false, bin: false };
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    if (!plugin?.enabled) continue;
    collectPluginWasm(managed, need, plugin);
    collectPluginPreset(managed, need, plugin);
  }
  // Parent mounts: a type "file" preset bind resolves through whatever fs
  // owns its parent path, so it is only safe on a task-private fresh fs.
  // The kernel toolset normally provides these; the plugin mechanism adds
  // them when nothing else does (e.g. a workspace without shell tools).
  if (need.preset) {
    ns.push({
      id: `${PLUGIN_BIND_PREFIX}preset-ns`,
      type: "ns",
      dst: "preset",
      src: "#ramfs/new",
    });
  }
  if (need.bin) {
    ns.push({
      id: `${PLUGIN_BIND_PREFIX}bin-ns`,
      type: "ns",
      dst: "bin",
      src: "#ramfs/new",
      perm: "0755",
    });
  }
  return { managed, ns };
}

// Upsert one bind by id, refreshing src/content/dst/perm; returns true
// when the list changed.
function upsertBind(binds, bind) {
  const index = binds.findIndex((item) => item.id === bind.id);
  if (index === -1) {
    binds.push(bind);
    return true;
  }
  const current = binds[index];
  if (
    current.src !== bind.src ||
    current.content !== bind.content ||
    current.dst !== bind.dst ||
    current.perm !== bind.perm
  ) {
    binds[index] = bind;
    return true;
  }
  return false;
}

// Reconcile plugin-declared wasm/preset binds into workspace.binds.
// Prunes stale plugin-owned binds, upserts the current declarations, adds
// the /bin and /preset ramfs parents when needed, and persists. Returns
// true when anything changed. Must run before the namespace is built
// (binds are baked at construction), which the app.js boot hook and the
// install/enable/disable/remove write paths both satisfy.
export function ensurePluginToolBinds(workspace, plugins) {
  if (!workspace) return false;
  workspace.binds = workspace.binds || [];
  const { managed, ns } = collectPluginBinds(plugins);
  const nsIds = new Set(ns.map((bind) => bind.id));
  // managed is keyed by dst; prune against the ids it currently owns.
  const managedIds = new Set([...managed.values()].map((bind) => bind.id));
  let changed = false;
  // Prune plugin-owned binds that no enabled plugin declares.
  const kept = [];
  for (const bind of workspace.binds) {
    const owned = String(bind?.id || "").startsWith(PLUGIN_BIND_PREFIX);
    if (owned && !managedIds.has(bind.id) && !nsIds.has(bind.id)) {
      changed = true;
      continue;
    }
    kept.push(bind);
  }
  workspace.binds = kept;
  // Upsert managed binds, then parent mounts — a parent (bin/preset) is
  // only added when no existing ns bind already provides the dst, so the
  // plugin mechanism never duplicates the kernel's task-bin/task-preset.
  for (const bind of managed.values()) {
    changed = upsertBind(workspace.binds, bind) || changed;
  }
  for (const nsBind of ns) {
    if (workspace.binds.some((item) =>
      item.dst === nsBind.dst && item.type === "ns"
    )) {
      continue;
    }
    changed = upsertBind(workspace.binds, nsBind) || changed;
  }
  if (!changed) return false;
  try {
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  } catch {
    // workspace store may be mid-migration; in-place mutation still covers
    // this session's namespace build.
  }
  return true;
}
