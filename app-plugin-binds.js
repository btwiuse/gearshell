// app-plugin-binds.js — plugin-declared wasm binaries + preset resources.
// Plugins may declare `wasm: [{id, dst, src}]` (a w9y-hosted binary to
// mount into every task's namespace as a fetch bind, like the kernel's
// task-bash/task-w9y), `files: [{id, dst, src}]` (any fetched resource,
// e.g. js-worker scripts or wasi modules under examples/) and
// `preset: [{id, dst, content}]` (an inline rc file on the per-task
// /preset ramfs). ensurePluginToolBinds reconciles those declarations
// into workspace.binds, mirroring how ensureTaskShellBinds
// (gear-bind.js) manages the kernel shell toolset — but the plugin
// version is self-sufficient: it also provides the /bin and /preset
// ramfs mounts when nothing else does.

import {
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.168";

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

// One files declaration -> managed fetch bind (same shape as wasm, but
// without the /bin parent mount: the resource is not a PATH binary).
// Any nested dst (e.g. "examples/hello.js") records its top-level parent
// so a fresh task namespace can mount it.
function collectPluginFiles(managed, need, plugin) {
  for (const file of plugin.files || []) {
    if (managed.has(file.dst)) continue;
    managed.set(file.dst, {
      id: bindIdFor(plugin.id, "files", file.id),
      type: "fetch",
      dst: file.dst,
      src: file.src,
      perm: file.perm || "0666",
    });
    const parent = file.dst.split("/")[0];
    if (parent && parent !== file.dst) need.parents.add(parent);
  }
}

// Collect the system-level managed binds for the enabled plugins
// (systemFiles declarations): dst -> bind. These mount into the SYSTEM
// root namespace (workspace.system.binds) and are visible to every task
// via the ns clone. Since the kernel's js driver started reading worker
// scripts from the task namespace (wanix v0.4.27), js workers can be
// declared per-task with `files`; systemFiles remains for resources that
// genuinely need to live in the root namespace.
export function collectPluginSystemBinds(plugins) {
  const managed = new Map();
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    if (!plugin?.enabled) continue;
    for (const file of plugin.systemFiles || []) {
      if (managed.has(file.dst)) continue;
      managed.set(file.dst, {
        id: bindIdFor(plugin.id, "system", file.id),
        type: "fetch",
        dst: file.dst,
        src: file.src,
        perm: file.perm || "0666",
      });
    }
  }
  const parents = new Set();
  for (const bind of managed.values()) {
    const parent = bind.dst.split("/")[0];
    if (parent && parent !== bind.dst) parents.add(parent);
  }
  return { managed, parents };
}

// Collect the managed bind map for the enabled plugins: dst -> bind.
export function collectPluginBinds(plugins) {
  const managed = new Map();
  const ns = [];
  const need = { preset: false, bin: false, parents: new Set() };
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    if (!plugin?.enabled) continue;
    collectPluginWasm(managed, need, plugin);
    collectPluginPreset(managed, need, plugin);
    collectPluginFiles(managed, need, plugin);
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
  // Top-level parents of files binds (e.g. "examples/"): a fresh ramfs
  // mount per parent, like /bin and /preset.
  for (const parent of need.parents) {
    ns.push({
      id: `${PLUGIN_BIND_PREFIX}${parent}-ns`,
      type: "ns",
      dst: parent,
      src: "#ramfs/new",
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

// Prune plugin-owned binds that no enabled plugin declares; returns true
// when any were removed.
function pruneStalePluginBinds(binds, managedIds, nsIds) {
  let changed = false;
  const kept = [];
  for (const bind of binds) {
    const owned = String(bind?.id || "").startsWith(PLUGIN_BIND_PREFIX);
    if (owned && !managedIds.has(bind.id) && !nsIds.has(bind.id)) {
      changed = true;
      continue;
    }
    kept.push(bind);
  }
  binds.length = 0;
  kept.forEach((bind) => binds.push(bind));
  return changed;
}

// The kernel applies binds in array order, so a fetch/file bind whose
// parent (e.g. examples/) is mounted later fails with "file does not
// exist". Move each plugin parent ns bind to sit right before the first
// bind mounted under it (workspaces saved before this fix have the
// parent appended last). Returns true when any bind moved.
function repositionPluginParents(binds, ns) {
  let changed = false;
  for (const nsBind of ns) {
    const i = binds.findIndex((item) => item && item.id === nsBind.id);
    if (i === -1) continue;
    const prefix = `${nsBind.dst}/`;
    const firstChild = binds.findIndex((item) =>
      item && item.dst && item.dst.startsWith(prefix)
    );
    if (firstChild === -1 || firstChild === i || firstChild === i + 1) continue;
    binds.splice(i, 1);
    binds.splice(firstChild > i ? firstChild - 1 : firstChild, 0, nsBind);
    changed = true;
  }
  return changed;
}

// Reconcile plugin-declared systemFiles into workspace.system.binds.
// Same lifecycle as ensurePluginToolBinds (prune + upsert + parent
// ordering), but on the system root namespace, so the kernel's js driver
// (which reads worker scripts from the root) can see them. Returns true
// when anything changed.
export function ensurePluginSystemFiles(workspace, plugins) {
  if (!workspace) return false;
  workspace.system = workspace.system || {};
  workspace.system.binds = workspace.system.binds || [];
  const { managed, parents } = collectPluginSystemBinds(plugins);
  const nsIds = new Set(
    [...parents].map((parent) => `${PLUGIN_BIND_PREFIX}${parent}-sys-ns`),
  );
  const managedIds = new Set([...managed.values()].map((bind) => bind.id));
  let changed = pruneStalePluginBinds(workspace.system.binds, managedIds, nsIds);
  const ns = [];
  for (const parent of parents) {
    ns.push({
      id: `${PLUGIN_BIND_PREFIX}${parent}-sys-ns`,
      type: "ns",
      dst: parent,
      src: "#ramfs/new",
    });
  }
  for (const nsBind of ns) {
    if (workspace.system.binds.some((item) =>
      item.dst === nsBind.dst && item.type === "ns"
    )) {
      continue;
    }
    changed = upsertBind(workspace.system.binds, nsBind) || changed;
  }
  for (const bind of managed.values()) {
    changed = upsertBind(workspace.system.binds, bind) || changed;
  }
  changed = repositionPluginParents(workspace.system.binds, ns) || changed;
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

// Reconcile plugin-declared wasm/preset/files binds into workspace.binds.
// Prunes stale plugin-owned binds, upserts the current declarations, adds
// the /bin and /preset ramfs parents when needed, and persists. Returns
// true when anything changed. Must run before the namespace is built
// (binds are baked at construction), which the app.js boot hook and the
// install/enable/disable/remove write paths all satisfy.
export function ensurePluginToolBinds(workspace, plugins) {
  if (!workspace) return false;
  workspace.binds = workspace.binds || [];
  const { managed, ns } = collectPluginBinds(plugins);
  const nsIds = new Set(ns.map((bind) => bind.id));
  const managedIds = new Set([...managed.values()].map((bind) => bind.id));
  // Prune stale plugin-owned binds that no enabled plugin declares.
  let changed = pruneStalePluginBinds(workspace.binds, managedIds, nsIds);
  // Upsert parent mounts, then the managed binds — a parent (bin/preset,
  // or a files parent like examples/) is only added when no existing ns
  // bind already provides the dst, so the plugin mechanism never
  // duplicates the kernel's task-bin/task-preset.
  for (const nsBind of ns) {
    if (workspace.binds.some((item) =>
      item.dst === nsBind.dst && item.type === "ns"
    )) {
      continue;
    }
    changed = upsertBind(workspace.binds, nsBind) || changed;
  }
  for (const bind of managed.values()) {
    changed = upsertBind(workspace.binds, bind) || changed;
  }
  changed = repositionPluginParents(workspace.binds, ns) || changed;
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
