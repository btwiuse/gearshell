// plugins-cards.js — plugin card + status badges for the Plugins page
// (split out of plugins-page.js for the 500-line rule; each card piece
// is a sub-50-line component).

import React from "react";
import { icons as LucideIcons } from "lucide-react";
import { AlertTriangle, Pencil, Power, Trash2 } from "lucide-react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function iconOf(name) {
  return LucideIcons[name] || LucideIcons.Wrench;
}

function badgeTags(plugin) {
  const tags = [];
  if (plugin.builtin) tags.push("built-in");
  if (plugin.required) tags.push("required");
  tags.push(plugin.enabled ? "enabled" : "disabled");
  if (plugin.loaded) tags.push("loaded");
  if (plugin.loadError) tags.push("load-error");
  return tags;
}

export function badgeClass(tag) {
  return "plugin-badge " + tag.replace("_", "-");
}

export function PluginBadges({ plugin }) {
  return html`
    <div className="plugin-card-badges">
      ${badgeTags(plugin).map((tag) =>
        html`<span key=${tag} className=${badgeClass(tag)}>${tag}</span>`,
      )}
    </div>
  `;
}

function CardTop({ plugin, onToggle }) {
  const Icon = iconOf(plugin.icon);
  return html`
    <div className="plugin-card-top">
      <div className="plugin-card-avatar">
        <${Icon} size=${18} aria-hidden=${true}/>
      </div>
      <div className="plugin-card-head">
        <div className="plugin-card-name">${plugin.name || plugin.id}</div>
        <div className="plugin-card-id">${plugin.id} · v${plugin.version}</div>
      </div>
      <label
        className="plugin-switch"
        title=${plugin.enabled ? "Disable plugin" : "Enable plugin"}
      >
        <input
          type="checkbox"
          checked=${plugin.enabled}
          disabled=${plugin.required}
          onChange=${() => onToggle(plugin)}
        />
        <span className="plugin-switch-slider"></span>
      </label>
    </div>
  `;
}

function CardPanels({ plugin }) {
  if (!plugin.panels?.length) return null;
  return html`
    <div className="plugin-card-panels">
      <${Power} size=${12} aria-hidden=${true}/>
      ${plugin.panels.join(", ")}
    </div>
  `;
}

function CardError({ plugin }) {
  if (!plugin.loadError) return null;
  return html`
    <div className="plugin-card-error">
      <${AlertTriangle} size=${13} aria-hidden=${true}/>
      <span>${plugin.loadError}</span>
    </div>
  `;
}

function CardActions({ plugin, onEdit, onRemove }) {
  return html`
    <div className="plugin-card-actions">
      <button
        type="button"
        className="plugin-action-btn"
        disabled=${plugin.required}
        title=${plugin.required
          ? "Required plugins are managed by the kernel"
          : ""}
        onClick=${() => onEdit(plugin)}
      >
        <${Pencil} size=${13} aria-hidden=${true}/>
        Edit
      </button>
      <button
        type="button"
        className="plugin-action-btn danger"
        disabled=${plugin.builtin}
        title=${plugin.builtin ? "Built-in plugins can only be disabled" : ""}
        onClick=${() => onRemove(plugin)}
      >
        <${Trash2} size=${13} aria-hidden=${true}/>
        Remove
      </button>
    </div>
  `;
}

export function PluginCard({ plugin, onToggle, onEdit, onRemove }) {
  const classes = [
    "plugin-card",
    plugin.enabled ? "" : "is-disabled",
    plugin.loadError ? "has-error" : "",
  ].filter(Boolean).join(" ");
  return html`
    <article className=${classes}>
      <${CardTop} plugin=${plugin} onToggle=${onToggle}/>
      <${PluginBadges} plugin=${plugin}/>
      <${CardPanels} plugin=${plugin}/>
      <${CardError} plugin=${plugin}/>
      <${CardActions} plugin=${plugin} onEdit=${onEdit} onRemove=${onRemove}/>
    </article>
  `;
}
