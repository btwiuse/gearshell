// plugins-modal.js — add/edit modal for the Plugins page (split out of
// plugins-page.js for the 500-line rule). Component plugins and
// entry-less iframe plugins are both formable: the modal toggles
// between an entry URL / VFS path and an iframe src.

import React, { useState } from "react";
import { Check, Code2, Globe2, X } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

// Form state helpers (pure, shared by the modal and its submit path).
export function initialValues(plugin) {
  const source = plugin || {};
  return {
    id: source.id || "",
    name: source.name || "",
    version: source.version || "1.0.0",
    icon: source.icon || "Wrench",
    entry: source.entry || "",
    permissions: (source.permissions?.api || []).join("\n"),
    src: source.iframe?.src || "",
    allow: source.iframe?.allow || "",
    allowFullscreen: !!source.iframe?.allowFullscreen,
  };
}

export function manifestFromValues(values, kind) {
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

function PluginField({ id, label, children }) {
  return html`
    <label className="plugin-field" htmlFor=${id}>
      <span className="plugin-field-label">${label}</span>
      ${children}
    </label>
  `;
}

function KindToggle({ kind, onKind }) {
  const btn = (value, icon, text) =>
    html`
      <button
        type="button"
        className=${"plugin-kind-btn" + (kind === value ? " active" : "")}
        onClick=${() => onKind(value)}
      >
        <${icon} size=${13} aria-hidden=${true}/>
        ${text}
      </button>
    `;
  return html`
    <div className="plugin-kind-toggle">
      ${btn("module", Code2, "Module")}
      ${btn("iframe", Globe2, "Iframe app")}
    </div>
  `;
}

function identityFields(values, set, editMode) {
  const field = (id, label, key, extra = {}) =>
    html`
      <${PluginField} id=${id} label=${label}>
        <input
          id=${id}
          type="text"
          value=${values[key]}
          spellCheck=${false}
          disabled=${editMode && key === "id"}
          onChange=${(event) => set({ ...values, [key]: event.target.value })}
          ...${extra}
        />
      </${PluginField}>
    `;
  return [
    field("plugins-id", "Id", "id", { placeholder: "my-app" }),
    field("plugins-name", "Name", "name", { placeholder: "My App" }),
    field("plugins-version", "Version", "version"),
    field("plugins-icon", "Icon", "icon", { placeholder: "Wrench" }),
  ];
}

function moduleFields(values, set) {
  return html`
    <div className="plugin-fields-grid">
      <${PluginField} id="plugins-entry" label="Entry URL / VFS path">
        <input
          id="plugins-entry"
          type="text"
          value=${values.entry}
          placeholder="https://cdn.example.com/my-app.js"
          spellCheck=${false}
          onChange=${(event) => set({ ...values, entry: event.target.value })}
        />
      </${PluginField}>
      <${PluginField} id="plugins-permissions" label="API permissions (one per line)">
        <textarea
          id="plugins-permissions"
          value=${values.permissions}
          placeholder=${"panels.*\nconfig.providers.list"}
          spellCheck=${false}
          onChange=${(event) =>
            set({ ...values, permissions: event.target.value })}
        ></textarea>
      </${PluginField}>
    </div>
  `;
}

function iframeFields(values, set) {
  return html`
    <div className="plugin-fields-grid">
      <${PluginField} id="plugins-src" label="Iframe src">
        <input
          id="plugins-src"
          type="url"
          value=${values.src}
          placeholder="https://example.com/app"
          spellCheck=${false}
          onChange=${(event) => set({ ...values, src: event.target.value })}
        />
      </${PluginField}>
      <${PluginField} id="plugins-allow" label="Permissions policy (allow)">
        <input
          id="plugins-allow"
          type="text"
          value=${values.allow}
          placeholder="clipboard-read; clipboard-write; fullscreen"
          spellCheck=${false}
          onChange=${(event) => set({ ...values, allow: event.target.value })}
        />
      </${PluginField}>
      <label className="plugin-check">
        <input
          type="checkbox"
          checked=${values.allowFullscreen}
          onChange=${(event) =>
            set({ ...values, allowFullscreen: event.target.checked })}
        />
        Allow fullscreen
      </label>
    </div>
  `;
}

function ModalShell({ title, onCancel, footer, children }) {
  return html`
    <div className="plugin-modal-overlay" onClick=${onCancel}>
      <div
        className="plugin-modal"
        onClick=${(event) => event.stopPropagation()}
      >
        <header className="plugin-modal-header">
          <h3>${title}</h3>
          <button
            type="button"
            className="plugin-modal-close"
            aria-label="Close"
            onClick=${onCancel}
          >
            <${X} size=${16} aria-hidden=${true}/>
          </button>
        </header>
        <div className="plugin-modal-body">${children}</div>
        <footer className="plugin-modal-footer">${footer}</footer>
      </div>
    </div>
  `;
}

function ModalBody({ values, set, kind, setKind, editMode }) {
  return html`
    <${React.Fragment}>
      <${KindToggle} kind=${kind} onKind=${setKind}/>
      <div className="plugin-fields-grid">
        ${identityFields(values, set, editMode)}
      </div>
      ${kind === "module" ? moduleFields(values, set) : iframeFields(values, set)}
    </${React.Fragment}>
  `;
}

export function PluginModal({ mode, plugin, onCancel, onSubmit }) {
  const [values, setValues] = useState(() => initialValues(plugin));
  const [kind, setKind] = useState(
    plugin?.entry ? "module" : plugin?.iframe?.src ? "iframe" : "module",
  );
  const title = mode === "edit" ? `Edit ${plugin.name}` : "Add plugin";
  const footer = [
    html`<button type="button" className="plugin-action-btn" onClick=${onCancel}>Cancel</button>`,
    html`<button
      type="button"
      className="plugin-action-btn primary"
      onClick=${() => onSubmit(values, kind)}
    >
      <${Check} size=${13} aria-hidden=${true}/>
      ${mode === "edit" ? "Save plugin" : "Install plugin"}
    </button>`,
  ];
  return html`
    <${ModalShell} title=${title} onCancel=${onCancel} footer=${footer}>
      <${ModalBody} values=${values} set=${setValues} kind=${kind} setKind=${setKind} editMode=${mode === "edit"}/>
    </${ModalShell}>
  `;
}
