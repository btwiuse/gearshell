// workspace-config-providers.js — AI provider + model CRUD (WISHLIST #1).
// Split out of workspace-config-api.js for the 500-line rule.
//
// Model providers live in the shell config (config.providers), the same
// store config.getShell / updateShell expose to gear. Writes record
// audit entries like any other shell change; every agent-facing read
// redacts apiKey (providers.list shows hasApiKey instead). The save path
// keeps the stored key whenever the caller sends an empty one, so an
// agent can edit a provider's other fields without ever learning its
// secret.

import { normalizeProviders } from "./app-normalize.js";
import { loadConfig, saveConfig } from "./app-workspace.js";
import {
  pushAuditEntry,
  redactSecrets,
} from "./workspace-audit.js";
import { emit } from "./workspace-events.js";

function auditOptions(agentOrOptions) {
  return typeof agentOrOptions === "string"
    ? { agent: agentOrOptions }
    : agentOrOptions;
}

function recordShellChange(prev, next, agentOrOptions) {
  pushAuditEntry({ prev, next, agent: auditOptions(agentOrOptions).agent });
  emit("config.changed", { result: redactSecrets(loadConfig()) });
}

function upsertProviderList(current, provider) {
  const existing = current.find((item) => item.id === provider.id);
  const merged = {
    ...provider,
    apiKey: provider.apiKey || existing?.apiKey || "",
  };
  if (!existing) return [...current, merged];
  return current.map((item) => (item.id === provider.id ? merged : item));
}

// Re-attach the stored apiKey to providers whose incoming key is empty.
// Applied on updateShell so a redacted getShell round-trip (apiKey:"")
// cannot wipe keys when an agent patches an unrelated field.
export function restoreProviderKeys(prevProviders, nextProviders) {
  const keys = new Map(
    normalizeProviders(prevProviders).map((item) => [item.id, item.apiKey]),
  );
  return normalizeProviders(nextProviders).map((provider) => ({
    ...provider,
    apiKey: provider.apiKey || keys.get(provider.id) || "",
  }));
}

function listModels() {
  return normalizeProviders(loadConfig().providers).flatMap((provider) =>
    (provider.models || []).map((model) => ({
      providerId: provider.id,
      ...(typeof model === "string" ? { id: model, name: model } : model),
    }))
  );
}

function saveModel(model, agentOrOptions = {}) {
  const providerId = String(model?.providerId || "").trim();
  const id = String(model?.id || model?.name || "").trim();
  if (!providerId || !id) throw new Error("model requires providerId and id");
  const config = loadConfig();
  const provider = normalizeProviders(config.providers).find((item) => item.id === providerId);
  if (!provider) throw new Error(`provider "${providerId}" not found`);
  const nextModel = { ...model, providerId: undefined, id, name: String(model.name || id).trim() };
  delete nextModel.providerId;
  const models = (provider.models || []).filter((item) =>
    (typeof item === "string" ? item : item.id) !== id
  );
  const next = { ...config, providers: config.providers.map((item) =>
    item.id === providerId ? { ...item, models: [...models, nextModel] } : item
  ) };
  saveConfig(next);
  recordShellChange(config, next, agentOrOptions);
  return { ok: true, model: { providerId, ...nextModel } };
}

function removeModel(providerId, modelId, agentOrOptions = {}) {
  const config = loadConfig();
  const provider = normalizeProviders(config.providers).find((item) => item.id === providerId);
  if (!provider) throw new Error(`provider "${providerId}" not found`);
  const models = (provider.models || []).filter((item) =>
    (typeof item === "string" ? item : item.id) !== modelId
  );
  if (models.length === (provider.models || []).length) throw new Error(`model "${modelId}" not found`);
  const next = { ...config, providers: config.providers.map((item) => item.id === providerId ? { ...item, models } : item) };
  saveConfig(next);
  recordShellChange(config, next, agentOrOptions);
  return { ok: true, providerId, removed: modelId };
}

function listProviders() {
  return normalizeProviders(loadConfig().providers).map((provider) => ({
    ...provider,
    apiKey: "",
    hasApiKey: Boolean(provider.apiKey),
  }));
}

function saveProvider(provider, agentOrOptions = {}) {
  const normalized = normalizeProviders([provider])[0];
  if (!normalized) {
    throw new Error("provider requires a name or id");
  }
  const prev = loadConfig();
  const providers = upsertProviderList(
    normalizeProviders(prev.providers),
    normalized,
  );
  const next = { ...prev, providers };
  saveConfig(next);
  recordShellChange(prev, next, agentOrOptions);
  const saved = normalizeProviders(providers).find(
    (item) => item.id === normalized.id,
  );
  return {
    ok: true,
    provider: {
      ...saved,
      apiKey: "",
      hasApiKey: Boolean(saved?.apiKey),
    },
  };
}

function removeProvider(id, agentOrOptions = {}) {
  const prev = loadConfig();
  const current = normalizeProviders(prev.providers);
  const providers = current.filter((item) => item.id !== id);
  if (providers.length === current.length) {
    throw new Error(`provider "${id}" not found`);
  }
  const next = { ...prev, providers };
  saveConfig(next);
  recordShellChange(prev, next, agentOrOptions);
  return { ok: true, removed: id };
}

export const providersApi = {
  list: listProviders,
  save: saveProvider,
  remove: removeProvider,
};

export const modelsApi = {
  list: listModels,
  save: saveModel,
  remove: removeModel,
};
