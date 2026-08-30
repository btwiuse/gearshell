// plugins-page.js — the standalone Plugins management page.
//
// A full-page UI (opened from the launcher, the Settings Plugins card,
// or panels.open("plugins")) for installing, editing, enabling and
// removing plugins. Every write goes through configApi.plugins.* — the
// same audited surface gear and the Settings section use — and the grid
// re-renders on PLUGIN_CHANGED_EVENT (async kernel loads) and
// WORKSPACE_CHANGED_EVENT (config edits elsewhere).
//
// Cards live in plugins-cards.js and the add/edit modal in
// plugins-modal.js; the shell that mounts this page into dockview is
// plugins-panel.js (500-line rule).

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Package,
  PackageOpen,
  Plus,
} from "lucide-react";
import { PLUGIN_CHANGED_EVENT } from "./plugins.js?v=20260829.104";
import { configApi } from "./workspace-config-api.js?v=20260828.125";
import { WORKSPACE_CHANGED_EVENT } from "./app-constants.js?v=20260828.99";
import { PluginCard } from "./plugins-cards.js?v=20260829.4";
import { PluginModal } from "./plugins-modal.js?v=20260829.3";
import htm from "htm";

const html = htm.bind(React.createElement);

// Manifest assembly from the modal form (module vs iframe kind).
function manifestFromModal(values, kind) {
  const permissions = values.permissions
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const manifest = {
    id: values.id.trim(),
    name: values.name.trim(),
    version: values.version.trim() || "1.0.0",
    icon: values.icon.trim() || "Wrench",
    ...(permissions.length > 0 ? { permissions: { api: permissions } } : {}),
  };
  if (kind === "iframe") {
    const src = values.src.trim();
    if (src) {
      manifest.iframe = {
        src,
        ...(values.allow.trim() ? { allow: values.allow.trim() } : {}),
        ...(values.allowFullscreen ? { allowFullscreen: true } : {}),
      };
    }
  } else {
    manifest.entry = values.entry.trim();
  }
  return manifest;
}

// All page actions in one factory so usePluginsState stays under the
// 50-line budget.
function makePluginActions(flash, setModal, setNotice) {
  const togglePlugin = (plugin) => {
    try {
      flash(
        configApi.plugins.setEnabled(plugin.id, !plugin.enabled),
        `${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}.`,
      );
    } catch (error) {
      setNotice({ kind: "error", text: error?.message || String(error) });
    }
  };
  const removePlugin = (plugin) => {
    if (!window.confirm(`Remove plugin "${plugin.name}"?`)) return;
    try {
      flash(configApi.plugins.remove(plugin.id), `${plugin.name} removed.`);
    } catch (error) {
      setNotice({ kind: "error", text: error?.message || String(error) });
    }
  };
  const submit = (values, kind) => {
    const manifest = manifestFromModal(values, kind);
    if (!manifest.id) {
      setNotice({ kind: "error", text: "Id is required." });
      return;
    }
    if (!manifest.entry && !manifest.iframe?.src &&
        !manifest.wasm?.length && !manifest.preset?.length) {
      setNotice({
        kind: "error",
        text: "Provide an entry URL / VFS path, an iframe src, or wasm/preset tools.",
      });
      return;
    }
    try {
      flash(
        configApi.plugins.install(manifest),
        `${manifest.name} saved. Loading…`,
      );
      setModal(null);
    } catch (error) {
      setNotice({ kind: "error", text: error?.message || String(error) });
    }
  };
  return { togglePlugin, removePlugin, submit };
}

// --- Page state ---
function usePluginsState() {
  const [plugins, setPlugins] = useState(() => configApi.plugins.list());
  const [modal, setModal] = useState(null); // {mode:"add"} | {mode:"edit", plugin}
  const [notice, setNotice] = useState(null); // {kind:"ok"|"error", text}
  useEffect(() => {
    const refresh = () => setPlugins(configApi.plugins.list());
    window.addEventListener(PLUGIN_CHANGED_EVENT, refresh);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(PLUGIN_CHANGED_EVENT, refresh);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    };
  }, []);
  const flash = (result, okText) => {
    setNotice(
      result?.ok ? { kind: "ok", text: okText } : {
        kind: "error",
        text: result?.error || "Failed.",
      },
    );
  };
  const actions = makePluginActions(flash, setModal, setNotice);
  return {
    plugins,
    modal,
    notice,
    setModal,
    dismissNotice: () => setNotice(null),
    ...actions,
  };
}

// --- Page chrome ---
function PluginsHeader({ count, enabled, onAdd }) {
  return html`
    <header className="plugins-header">
      <div className="plugins-header-title">
        <${Package} size=${18} aria-hidden=${true}/>
        <h2>Plugins</h2>
        <span className="plugins-header-note">${count} installed · ${enabled} enabled</span>
      </div>
      <button
        type="button"
        className="plugin-action-btn primary"
        onClick=${onAdd}
      >
        <${Plus} size=${14} aria-hidden=${true}/>
        Add plugin
      </button>
    </header>
  `;
}

function PluginsNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const ok = notice.kind === "ok";
  return html`
    <div
      className=${"plugins-notice " + (ok ? "ok" : "error")}
      role="status"
      onClick=${onDismiss}
    >
      ${ok
        ? html`<${Check} size=${14} aria-hidden=${true}/>`
        : html`<${AlertTriangle} size=${14} aria-hidden=${true}/>`}
      <span>${notice.text}</span>
    </div>
  `;
}

function PluginsGrid({ plugins, onToggle, onEdit, onRemove }) {
  return html`
    <div className="plugins-grid">
      ${plugins.map((plugin) =>
        html`<${PluginCard} key=${plugin.id} plugin=${plugin} onToggle=${onToggle} onEdit=${onEdit} onRemove=${onRemove}/>`,
      )}
    </div>
  `;
}

function PluginsEmpty({ onAdd }) {
  return html`
    <div className="plugins-empty">
      <${PackageOpen} size=${28} aria-hidden=${true}/>
      <p>No plugins installed yet.</p>
      <button
        type="button"
        className="plugin-action-btn primary"
        onClick=${onAdd}
      >Install your first plugin</button>
    </div>
  `;
}

function PluginsFooter() {
  return html`
    <footer className="plugins-footer">
      <${PackageOpen} size=${13} aria-hidden=${true}/>
      <span>A plugin is a manifest with an ES-module entry (component panels) or an iframe src (sandboxed apps). </span>
      <a
        href="https://github.com/btwiuse/gearshell/wiki"
        target="_blank"
        rel="noreferrer"
      >
        Plugin guide
        <${ExternalLink} size=${11} aria-hidden=${true}/>
      </a>
    </footer>
  `;
}

export function PluginsPage() {
  const state = usePluginsState();
  const enabledCount = state.plugins.filter((plugin) => plugin.enabled).length;
  const editing = state.modal?.mode === "edit" ? state.modal.plugin : null;
  return html`
    <div className="plugins-page">
      <${PluginsHeader} count=${state.plugins.length} enabled=${enabledCount} onAdd=${() => state.setModal({ mode: "add" })}/>
      <${PluginsNotice} notice=${state.notice} onDismiss=${state.dismissNotice}/>
      <${PluginsGrid}
        plugins=${state.plugins}
        onToggle=${state.togglePlugin}
        onEdit=${(plugin) => state.setModal({ mode: "edit", plugin })}
        onRemove=${state.removePlugin}
      />
      ${state.plugins.length === 0 &&
        html`<${PluginsEmpty} onAdd=${() => state.setModal({ mode: "add" })}/>`}
      <${PluginsFooter}/>
      ${state.modal &&
        html`<${PluginModal}
          mode=${state.modal.mode}
          plugin=${editing}
          onCancel=${() => state.setModal(null)}
          onSubmit=${state.submit}
        />`}
    </div>
  `;
}
