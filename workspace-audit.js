// workspace-audit.js — agent config-change audit ring (A1).
//
// Records every agent-initiated config change (config.updateShell plus the
// system-config writes config.updateBind/removeBind/setBinds/updateRuntime
// through window.GearShell / gear) as {id, ts, agent, kind, prev, next} in
// a capped localStorage ring, so a human can review agent edits in the
// Settings panel and undo them. The Settings UI saves config through
// saveConfig directly (never config.updateShell), so UI-driven changes
// are never attributed to an agent.
//
// Entries are kind-tagged: "shell" entries snapshot the shell config and
// undo restores it via saveConfig; "system" entries snapshot the
// {system, runtime} slices and undo writes them straight back into the
// active workspace. Entries saved before the kind field existed default
// to "shell".
//
// jsfs gives no caller identity, so `agent` is whatever the caller
// passes as the optional second argument; it defaults to "agent".

import {
  loadActiveWorkspace,
  notifyWorkspaceChange,
  saveConfig,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.150";
import { normalizeSystemConfig } from "./app-normalize.js?v=20260828.151";

const AUDIT_KEY = "gear-shell-agent-audit";
const AUDIT_CAP = 50;
export const AGENT_AUDIT_CHANGED_EVENT = "GearShellAgentAuditChanged";

let seq = 0;

function emitAuditChanged() {
  window.dispatchEvent(new CustomEvent(AGENT_AUDIT_CHANGED_EVENT));
}

function readAudit() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAudit(entries) {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable (private mode / quota); audit is best-effort
  }
}

export function pushAuditEntry({ prev, next, agent, kind = "shell" }) {
  // No-op patches (identical snapshot) never enter the ring.
  if (JSON.stringify(prev) === JSON.stringify(next)) return null;
  const entry = {
    id: `a${Date.now().toString(36)}-${++seq}`,
    ts: Date.now(),
    agent: typeof agent === "string" && agent ? agent : "agent",
    kind: kind === "system" ? "system" : "shell",
    prev,
    next,
    undone: false,
  };
  const entries = [entry, ...readAudit()].slice(0, AUDIT_CAP);
  writeAudit(entries);
  emitAuditChanged();
  return entry;
}

// Restore a "system" entry's snapshot: writes the saved {system, runtime}
// slices back into the active workspace. The snapshot always carries a
// full normalized system (binds + allowOrigins), so re-normalizing is
// idempotent and cannot resurrect stale migration artifacts.
function restoreSystemSnapshot(snapshot) {
  const workspace = loadActiveWorkspace();
  if (snapshot?.system) {
    workspace.system = normalizeSystemConfig(snapshot.system);
  }
  if (snapshot?.runtime) {
    workspace.runtime = { ...snapshot.runtime };
  }
  saveWorkspace(workspace);
  updateWorkspaceIndex(workspace);
  notifyWorkspaceChange();
}

// Deep-copy a value with every `apiKey` field blanked (kept as "" so the
// shape survives round-trips; never deleted). Agents read the audit ring
// and the config views, so provider secrets must not leave through them.
export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = key === "apiKey" ? "" : redactSecrets(val);
    }
    return out;
  }
  return value;
}

// The ring is stored raw so undo can restore real snapshots; every read
// path (Settings "Agent activity", gear config.audit.list) gets scrubbed
// copies instead.
export function listAuditEntries() {
  return readAudit().map(redactSecrets);
}

export function clearAuditEntries() {
  writeAudit([]);
  emitAuditChanged();
  return { ok: true };
}

export function undoAuditEntry(id) {
  const entries = readAudit();
  const entry = entries.find((item) => item.id === id);
  if (!entry) return { ok: false, error: "audit entry not found" };
  if (entry.undone) return { ok: false, error: "audit entry already undone" };
  // Restore the pre-edit snapshot. Deliberately writes the whole slice
  // (not a per-key merge): the agent may have edited several fields in
  // one call, and undo must return the system to exactly the saved state.
  if (entry.kind === "system") {
    restoreSystemSnapshot(entry.prev);
  } else {
    saveConfig(entry.prev);
  }
  entry.undone = true;
  writeAudit(entries);
  emitAuditChanged();
  return { ok: true, entry };
}
