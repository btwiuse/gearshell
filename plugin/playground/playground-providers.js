// playground-providers.js — the Providers tab of the GearShell API
// Playground: model provider CRUD over config.providers.
//
// Providers live in the shell config (gear-shell-config, the same
// store config.getShell / config.updateShell expose to gear), so they
// are readable and writable from both the UI and the agent channel.
// Writes go through configApi.providers.save/remove (the very methods
// gear exposes), which record audit entries and redact apiKeys in every
// agent-facing view. The editor deliberately starts the apiKey field
// empty when editing: an empty key means "keep the stored key".
//
// Read path: loadConfig() returns the raw normalized config (keys
// present), so the UI can show whether a key is set without ever
// printing it.

import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { loadConfig } from "../../app-workspace.js?v=20260826.131";
import { configApi } from "../../workspace-config-api.js?v=20260828.116";
import { WORKSPACE_CHANGED_EVENT } from "../../app-constants.js?v=20260828.90";

function blankDraft() {
  return {
    id: "",
    name: "",
    baseURL: "",
    apiKey: "",
    modelsText: "",
    enabled: true,
  };
}

function draftFromProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    baseURL: provider.baseURL,
    apiKey: "",
    modelsText: (provider.models || []).join("\n"),
    enabled: provider.enabled !== false,
  };
}

function slugify(value) {
  const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "provider";
}

function modelsFromText(text) {
  return String(text || "").split(/\n+/).map((line) => line.trim())
    .filter(Boolean);
}

function readProviders() {
  return loadConfig().providers || [];
}

function ProviderBadges({ provider }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "span",
      {
        className: "playground-provider-badge" +
          (provider.enabled ? " on" : ""),
      },
      provider.enabled ? "enabled" : "disabled",
    ),
    React.createElement(
      "span",
      {
        className: "playground-provider-badge" +
          (provider.apiKey ? " key" : ""),
      },
      provider.apiKey ? "api key set" : "no api key",
    ),
  );
}

function ProviderMeta({ provider }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { className: "playground-provider-meta" },
      React.createElement("code", null, provider.id),
      provider.baseURL &&
        React.createElement("code", null, provider.baseURL),
    ),
    (provider.models || []).length > 0 &&
      React.createElement(
        "div",
        { className: "playground-provider-models" },
        provider.models.join(", "),
      ),
  );
}

function ProviderRow({ provider, onEdit, onDelete }) {
  return React.createElement(
    "div",
    { className: "playground-provider-row" },
    React.createElement(
      "div",
      { className: "playground-provider-main" },
      React.createElement(
        "div",
        { className: "playground-provider-title" },
        React.createElement(
          "span",
          { className: "playground-provider-name" },
          provider.name || provider.id,
        ),
        React.createElement(ProviderBadges, { provider }),
      ),
      React.createElement(ProviderMeta, { provider }),
    ),
    React.createElement(
      "div",
      { className: "playground-provider-actions" },
      React.createElement(
        "button",
        { type: "button", onClick: () => onEdit(provider) },
        "Edit",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "danger",
          onClick: () => onDelete(provider),
        },
        "Delete",
      ),
    ),
  );
}

const PROVIDER_TEXT_FIELDS = [
  { key: "name", label: "Name", placeholder: "OpenAI" },
  {
    key: "id",
    label: "Id (optional — derived from the name)",
    placeholder: "openai",
  },
  {
    key: "baseURL",
    label: "Base URL",
    placeholder: "https://api.openai.com/v1",
    type: "url",
  },
];

function ProviderTextField({ field, value, onChange }) {
  return React.createElement(
    "label",
    { className: "playground-arg" },
    React.createElement(
      "span",
      { className: "playground-arg-label" },
      field.label,
    ),
    React.createElement("input", {
      type: field.type || "text",
      className: "playground-text-input",
      value,
      placeholder: field.placeholder,
      onChange,
    }),
  );
}

// The editor's special fields: the password key field, the models
// textarea and the enabled toggle (text fields render via the map in
// ProviderFields).
function ProviderSpecialFields({ local, set, isNew }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "label",
      { className: "playground-arg" },
      React.createElement(
        "span",
        { className: "playground-arg-label" },
        "API key",
      ),
      React.createElement("input", {
        type: "password",
        className: "playground-text-input",
        value: local.apiKey,
        placeholder: isNew ? "sk-…" : "leave empty to keep the stored key",
        onChange: set("apiKey"),
        autoComplete: "off",
      }),
    ),
    React.createElement(
      "label",
      { className: "playground-arg" },
      React.createElement(
        "span",
        { className: "playground-arg-label" },
        "Models (one per line)",
      ),
      React.createElement("textarea", {
        className: "playground-json-input",
        rows: 4,
        value: local.modelsText,
        placeholder: "gpt-4o\ngpt-4o-mini",
        spellCheck: false,
        onChange: set("modelsText"),
      }),
    ),
    React.createElement(
      "label",
      { className: "playground-arg playground-arg-check" },
      React.createElement("input", {
        type: "checkbox",
        checked: local.enabled,
        onChange: set("enabled"),
      }),
      React.createElement("span", null, "Enabled"),
    ),
  );
}

// The editor field block: text fields plus the special fields.
function ProviderFields({ local, set, isNew }) {
  return React.createElement(
    "div",
    { className: "playground-provider-fields" },
    PROVIDER_TEXT_FIELDS.map((field) =>
      React.createElement(ProviderTextField, {
        key: field.key,
        field,
        value: local[field.key],
        onChange: set(field.key),
      })
    ),
    React.createElement(ProviderSpecialFields, { local, set, isNew }),
  );
}

function ProviderEditor({ draft, onSave, onCancel, isNew }) {
  const [local, setLocal] = useState(draft);
  const [error, setError] = useState("");
  const set = (key) => (event) => {
    const value = event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;
    setLocal((prev) => ({ ...prev, [key]: value }));
    setError("");
  };
  const save = () => {
    const name = local.name.trim();
    if (!name) {
      setError("A provider name is required.");
      return;
    }
    if (!local.baseURL.trim()) {
      setError("A baseURL is required (e.g. https://api.openai.com/v1).");
      return;
    }
    onSave({
      ...local,
      id: local.id.trim() || slugify(local.name),
      name,
      baseURL: local.baseURL.trim(),
      apiKey: local.apiKey,
      models: modelsFromText(local.modelsText),
      enabled: local.enabled,
    });
  };
  return React.createElement(
    "div",
    { className: "playground-provider-editor" },
    React.createElement(ProviderFields, { local, set, isNew }),
    error && React.createElement("p", { className: "playground-error" }, error),
    React.createElement(
      "div",
      { className: "playground-actions" },
      React.createElement(
        "button",
        { type: "button", className: "playground-run", onClick: save },
        isNew ? "Add provider" : "Save changes",
      ),
      React.createElement(
        "button",
        { type: "button", className: "playground-copy", onClick: onCancel },
        "Cancel",
      ),
    ),
  );
}

function saveProviderDraft(provider, setStatus, setDraft, refresh, setError) {
  try {
    const result = configApi.providers.save(provider);
    setStatus(
      result?.ok
        ? `Saved "${provider.name}".`
        : result?.error || "Save failed.",
    );
    setDraft(null);
    refresh();
  } catch (caught) {
    setError(caught?.message || String(caught));
  }
}

function deleteProviderDraft(provider, setStatus, refresh, setError) {
  if (!window.confirm(`Delete provider "${provider.name}"?`)) return;
  try {
    const result = configApi.providers.remove(provider.id);
    setStatus(
      result?.ok
        ? `Deleted "${provider.name}".`
        : result?.error || "Delete failed.",
    );
    refresh();
  } catch (caught) {
    setError(caught?.message || String(caught));
  }
}

function useProvidersState() {
  const [providers, setProviders] = useState(readProviders);
  const [draft, setDraft] = useState(null); // null | draft; isNew flag on it
  const [isNew, setIsNew] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setProviders(readProviders());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
  }, [refresh]);

  const startAdd = () => {
    setDraft(blankDraft());
    setIsNew(true);
    setError("");
    setStatus("");
  };
  const startEdit = (provider) => {
    setDraft(draftFromProvider(provider));
    setIsNew(false);
    setError("");
    setStatus("");
  };
  const cancel = () => {
    setDraft(null);
    setError("");
  };
  const save = (provider) =>
    saveProviderDraft(provider, setStatus, setDraft, refresh, setError);
  const remove = (provider) =>
    deleteProviderDraft(provider, setStatus, refresh, setError);
  return {
    providers,
    draft,
    isNew,
    status,
    error,
    startAdd,
    startEdit,
    cancel,
    save,
    remove,
  };
}

function ProvidersHead({ adding, onAdd }) {
  return React.createElement(
    "div",
    { className: "playground-providers-head" },
    React.createElement(
      "div",
      null,
      React.createElement("h3", null, "Model providers"),
      React.createElement(
        "p",
        { className: "playground-hint" },
        "Stored in the shell config and exposed to agents via " +
          "config.providers.* (gear). API keys are never shown back " +
          "through the agent channel.",
      ),
    ),
    !adding &&
      React.createElement(
        "button",
        { type: "button", className: "playground-run", onClick: onAdd },
        React.createElement(Plus, { size: 14, "aria-hidden": true }),
        " Add provider",
      ),
  );
}

function ProviderList({ providers, onEdit, onDelete }) {
  return React.createElement(
    "div",
    { className: "playground-provider-list" },
    providers.length === 0
      ? React.createElement(
        "p",
        { className: "playground-hint" },
        "No providers configured yet. Add one to start pointing " +
          "chat / image / video tools at a model API.",
      )
      : providers.map((provider) =>
        React.createElement(ProviderRow, {
          key: provider.id,
          provider,
          onEdit,
          onDelete,
        })
      ),
  );
}

export function ProvidersView() {
  const state = useProvidersState();
  return React.createElement(
    "div",
    { className: "playground-providers" },
    React.createElement(ProvidersHead, {
      adding: !!state.draft,
      onAdd: state.startAdd,
    }),
    state.draft &&
      React.createElement(ProviderEditor, {
        draft: state.draft,
        isNew: state.isNew,
        onSave: state.save,
        onCancel: state.cancel,
      }),
    state.status &&
      React.createElement("p", { className: "playground-ok" }, state.status),
    state.error &&
      React.createElement("p", { className: "playground-error" }, state.error),
    React.createElement(ProviderList, {
      providers: state.providers,
      onEdit: state.startEdit,
      onDelete: state.remove,
    }),
  );
}
