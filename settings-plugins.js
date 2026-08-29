// Settings "Plugins" section wiring (WISHLIST #9): list installed
// plugins with their live load status, install/update from the manifest
// form, and enable / disable / remove. All writes go through
// configApi.plugins.* — the same audited surface gctl exposes — and the
// section re-renders on PLUGIN_CHANGED_EVENT (async kernel loads) and
// WORKSPACE_CHANGED_EVENT (config edits elsewhere).

import { PLUGIN_CHANGED_EVENT } from "./plugins.js?v=20260829.27";
import { configApi } from "./workspace-config-api.js?v=20260828.48";
import { WORKSPACE_CHANGED_EVENT } from "./app-constants.js?v=20260828.23";

function queryElements(settingsContent) {
  return {
    list: settingsContent.querySelector("[data-plugin-list]"),
    fields: settingsContent.querySelector(".plugin-fields"),
    status: settingsContent.querySelector('[data-plugin="status"]'),
    addButton: settingsContent.querySelector('[data-plugin-action="add"]'),
    installButton: settingsContent.querySelector(
      '[data-plugin-action="install"]',
    ),
    cancelButton: settingsContent.querySelector(
      '[data-plugin-action="cancel"]',
    ),
  };
}

function pluginBadgeTags(plugin) {
  const tags = [];
  if (plugin.builtin) tags.push("built-in");
  tags.push(plugin.enabled ? "enabled" : "disabled");
  if (plugin.loaded) tags.push("loaded");
  if (plugin.loadError) tags.push("load-error");
  return tags;
}

function badgeSpan(tag) {
  const b = document.createElement("span");
  b.className = "plugin-row-badge " + tag;
  b.textContent = tag;
  return b;
}

function pluginMetaBlock(plugin) {
  const meta = document.createElement("div");
  meta.className = "plugin-row-meta";
  const idCode = document.createElement("code");
  idCode.textContent = plugin.id;
  const entryCode = document.createElement("code");
  entryCode.textContent = plugin.entry;
  meta.append(idCode, entryCode);
  if (plugin.panels && plugin.panels.length > 0) {
    const panels = document.createElement("div");
    panels.className = "plugin-row-panels";
    panels.textContent = `panels: ${plugin.panels.join(", ")}`;
    meta.append(panels);
  }
  if (plugin.loadError) {
    const error = document.createElement("div");
    error.className = "plugin-row-error";
    error.textContent = plugin.loadError;
    meta.append(error);
  }
  return meta;
}

function renderPluginRow(plugin, handlers) {
  const row = document.createElement("div");
  row.className = "plugin-row" + (plugin.enabled ? "" : " disabled");
  const main = document.createElement("div");
  main.className = "plugin-row-main";
  const head = document.createElement("div");
  head.className = "plugin-row-head";
  const title = document.createElement("span");
  title.className = "plugin-row-name";
  title.textContent = plugin.name || plugin.id;
  const version = document.createElement("span");
  version.className = "plugin-row-version";
  version.textContent = `v${plugin.version}`;
  head.append(title, version);
  for (const tag of pluginBadgeTags(plugin)) head.append(badgeSpan(tag));
  main.append(head, pluginMetaBlock(plugin));
  row.append(main);
  row.append(pluginActionButtons(plugin, handlers));
  return row;
}

function pluginActionButtons(
  plugin,
  { togglePlugin, removePlugin, startEdit },
) {
  const actions = document.createElement("div");
  actions.className = "plugin-row-actions";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = plugin.enabled ? "Disable" : "Enable";
  toggle.addEventListener("click", () => togglePlugin(plugin));
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => startEdit(plugin));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Remove";
  remove.disabled = plugin.builtin;
  remove.title = plugin.builtin ? "Built-in plugins can only be disabled" : "";
  remove.addEventListener("click", () => removePlugin(plugin));
  actions.append(toggle, edit, remove);
  return actions;
}

function renderPluginList(els, plugins, handlers) {
  els.list.replaceChildren();
  if (plugins.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No plugins installed yet.";
    els.list.append(empty);
    return;
  }
  for (const plugin of plugins) {
    els.list.append(renderPluginRow(plugin, handlers));
  }
}

// Read the manifest form into an installable manifest object.
function manifestFromFields(els) {
  const get = (name) => els.fields.querySelector(`[data-plugin="${name}"]`);
  const permissions = get("permissions").value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    id: get("id").value.trim(),
    name: get("name").value.trim(),
    version: get("version").value.trim() || "1.0.0",
    icon: get("icon").value.trim() || "Wrench",
    entry: get("entry").value.trim(),
    permissions: permissions.length > 0 ? { api: permissions } : {},
  };
}

function fillManifestFields(els, manifest) {
  const source = manifest || {};
  const get = (name) => els.fields.querySelector(`[data-plugin="${name}"]`);
  get("id").value = source.id || "";
  get("name").value = source.name || "";
  get("version").value = source.version || "1.0.0";
  get("icon").value = source.icon || "Wrench";
  get("entry").value = source.entry || "";
  get("permissions").value = (source.permissions?.api || []).join("\n");
}

function setStatus(els, message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "#f85149" : "#8b949e";
}

// Section action helpers (kept as small factories so every function
// stays under the 50-line budget).
function showForm(els, isNew, plugin) {
  fillManifestFields(els, plugin);
  els.fields.hidden = false;
  els.installButton.hidden = false;
  els.installButton.textContent = isNew
    ? "Install plugin"
    : "Install / update plugin";
  els.cancelButton.hidden = false;
}

function hideForm(els) {
  els.fields.hidden = true;
  els.installButton.hidden = true;
  els.cancelButton.hidden = true;
}

function flashResult(els, result, okMessage) {
  setStatus(els, result.ok ? okMessage : result.error || "Failed.");
}

// All section actions in one factory so setupPluginsForm stays under the
// 50-line budget.
function makePluginActions(els) {
  const cancelEdit = () => hideForm(els);
  const startAdd = () => showForm(els, true, null);
  const startEdit = (plugin) => showForm(els, false, plugin);
  const togglePlugin = (plugin) => {
    try {
      flashResult(
        els,
        configApi.plugins.setEnabled(plugin.id, !plugin.enabled),
        "Saved.",
      );
    } catch (error) {
      setStatus(els, error?.message || String(error), true);
    }
  };
  const removePlugin = (plugin) => {
    if (!window.confirm(`Remove plugin "${plugin.name}"?`)) return;
    try {
      flashResult(els, configApi.plugins.remove(plugin.id), "Removed.");
    } catch (error) {
      setStatus(els, error?.message || String(error), true);
    }
  };
  const submit = () => {
    const manifest = manifestFromFields(els);
    if (!manifest.id || !manifest.entry) {
      setStatus(els, "Id and entry are required.", true);
      return;
    }
    try {
      flashResult(
        els,
        configApi.plugins.install(manifest),
        "Installed. Loading…",
      );
      cancelEdit();
    } catch (error) {
      setStatus(els, error?.message || String(error), true);
    }
  };
  return {
    togglePlugin,
    removePlugin,
    startAdd,
    startEdit,
    cancelEdit,
    submit,
  };
}

export function setupPluginsForm(settingsContent) {
  const els = queryElements(settingsContent);
  if (!els.list || !els.addButton || !els.installButton) return;
  const actions = makePluginActions(els);
  const render = () => {
    renderPluginList(els, configApi.plugins.list(), actions);
  };
  els.addButton.addEventListener("click", actions.startAdd);
  els.installButton.addEventListener("click", actions.submit);
  els.cancelButton.addEventListener("click", actions.cancelEdit);
  window.addEventListener(PLUGIN_CHANGED_EVENT, render);
  window.addEventListener(WORKSPACE_CHANGED_EVENT, render);
  render();
  return () => {
    window.removeEventListener(PLUGIN_CHANGED_EVENT, render);
    window.removeEventListener(WORKSPACE_CHANGED_EVENT, render);
  };
}
