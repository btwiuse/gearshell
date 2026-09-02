// kv-api.js — host-side implementation of the generic
// `config.kv` JSON key-value store exposed on workspaceConfigApi.
// Any plugin can opt in by declaring `config.kv.*` in its manifest
// permissions and calling `GearShell.config.kv.{get,set,delete,list}`.
//
// Keys are arbitrary strings; values are JSON-serialisable. The
// store is per-workspace (lives under `workspace.shell.kv`). Every
// write goes through the audit ring (`kind: "system"`) and fires
// `config.changed`, so undo and live-watch behave the same as any
// other system-config write.

import { loadConfig, saveConfig } from "../../app-workspace.js";
import { pushAuditEntry, redactSecrets } from "../../workspace-audit.js";
import { pushEvent } from "../../workspace-events.js";

function auditAgent(input) {
  if (typeof input === "string") return input;
  return input && typeof input === "object" ? input.agent : undefined;
}

function readKv() {
  return (loadConfig().kv && typeof loadConfig().kv === "object")
    ? loadConfig().kv
    : {};
}

function writeKv(nextKv, agentOrOptions) {
  const prev = loadConfig();
  const next = { ...prev, kv: nextKv };
  saveConfig(next);
  pushAuditEntry({
    prev,
    next,
    agent: auditAgent(agentOrOptions),
    kind: "system",
  });
  pushEvent("config.changed", { result: redactSecrets(next) });
}

export function kvGet(key) {
  if (typeof key !== "string" || !key) return undefined;
  const kv = readKv();
  return Object.prototype.hasOwnProperty.call(kv, key)
    ? kv[key]
    : undefined;
}

export function kvSet(key, value, agentOrOptions) {
  if (typeof key !== "string" || !key) {
    throw new Error("config.kv.set: key must be a non-empty string");
  }
  const kv = { ...readKv(), [key]: value };
  writeKv(kv, agentOrOptions);
  return { key, value };
}

export function kvDelete(key, agentOrOptions) {
  if (typeof key !== "string" || !key) {
    throw new Error("config.kv.delete: key must be a non-empty string");
  }
  const kv = { ...readKv() };
  const had = Object.prototype.hasOwnProperty.call(kv, key);
  if (had) delete kv[key];
  if (!had) return { deleted: false };
  writeKv(kv, agentOrOptions);
  return { deleted: true };
}

export function kvList(prefix) {
  const kv = readKv();
  const keys = Object.keys(kv).sort();
  if (typeof prefix !== "string" || !prefix) return keys;
  return keys.filter((key) => key.startsWith(prefix));
}

export const kvConfigApi = {
  get: kvGet,
  set: kvSet,
  delete: kvDelete,
  list: kvList,
};