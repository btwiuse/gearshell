// plugins-cards.js — plugin card + status badges for the Plugins page
// (split out of plugins-page.js for the 500-line rule; each card piece
// is a sub-50-line component).

import React from "react";
import { icons as LucideIcons } from "lucide-react";
import { AlertTriangle, Pencil, Power, Trash2 } from "lucide-react";

export function iconOf(name) {
  return LucideIcons[name] || LucideIcons.Wrench;
}

function badgeTags(plugin) {
  const tags = [];
  if (plugin.builtin) tags.push("built-in");
  tags.push(plugin.enabled ? "enabled" : "disabled");
  if (plugin.loaded) tags.push("loaded");
  if (plugin.loadError) tags.push("load-error");
  return tags;
}

export function badgeClass(tag) {
  return "plugin-badge " + tag.replace("_", "-");
}

export function PluginBadges({ plugin }) {
  return React.createElement(
    "div",
    { className: "plugin-card-badges" },
    badgeTags(plugin).map((tag) =>
      React.createElement(
        "span",
        { key: tag, className: badgeClass(tag) },
        tag,
      )
    ),
  );
}

function CardTop({ plugin, onToggle }) {
  const Icon = iconOf(plugin.icon);
  return React.createElement(
    "div",
    { className: "plugin-card-top" },
    React.createElement(
      "div",
      { className: "plugin-card-avatar" },
      React.createElement(Icon, { size: 18, "aria-hidden": true }),
    ),
    React.createElement(
      "div",
      { className: "plugin-card-head" },
      React.createElement(
        "div",
        { className: "plugin-card-name" },
        plugin.name || plugin.id,
      ),
      React.createElement(
        "div",
        { className: "plugin-card-id" },
        `${plugin.id} · v${plugin.version}`,
      ),
    ),
    React.createElement(
      "label",
      {
        className: "plugin-switch",
        title: plugin.enabled ? "Disable plugin" : "Enable plugin",
      },
      React.createElement("input", {
        type: "checkbox",
        checked: plugin.enabled,
        onChange: () => onToggle(plugin),
      }),
      React.createElement("span", { className: "plugin-switch-slider" }),
    ),
  );
}

function CardPanels({ plugin }) {
  if (!plugin.panels?.length) return null;
  return React.createElement(
    "div",
    { className: "plugin-card-panels" },
    React.createElement(Power, { size: 12, "aria-hidden": true }),
    plugin.panels.join(", "),
  );
}

function CardError({ plugin }) {
  if (!plugin.loadError) return null;
  return React.createElement(
    "div",
    { className: "plugin-card-error" },
    React.createElement(AlertTriangle, { size: 13, "aria-hidden": true }),
    React.createElement("span", null, plugin.loadError),
  );
}

function CardActions({ plugin, onEdit, onRemove }) {
  return React.createElement(
    "div",
    { className: "plugin-card-actions" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "plugin-action-btn",
        onClick: () => onEdit(plugin),
      },
      React.createElement(Pencil, { size: 13, "aria-hidden": true }),
      "Edit",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "plugin-action-btn danger",
        disabled: plugin.builtin,
        title: plugin.builtin ? "Built-in plugins can only be disabled" : "",
        onClick: () => onRemove(plugin),
      },
      React.createElement(Trash2, { size: 13, "aria-hidden": true }),
      "Remove",
    ),
  );
}

export function PluginCard({ plugin, onToggle, onEdit, onRemove }) {
  const classes = [
    "plugin-card",
    plugin.enabled ? "" : "is-disabled",
    plugin.loadError ? "has-error" : "",
  ].filter(Boolean).join(" ");
  return React.createElement(
    "article",
    { className: classes },
    React.createElement(CardTop, { plugin, onToggle }),
    React.createElement(PluginBadges, { plugin }),
    React.createElement(CardPanels, { plugin }),
    React.createElement(CardError, { plugin }),
    React.createElement(CardActions, { plugin, onEdit, onRemove }),
  );
}
