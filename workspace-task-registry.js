// workspace-task-registry.js — persisted agent-task registry + boot GC
// (split out of workspace-api.js for the 500-line rule).

import {
  loadActiveWorkspace,
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.72";

// --- Agent-managed task registry ---
// Persisted tasks created via tasks.create({ persist: true }) are tracked
// here, NOT inside the workspace schema: task status is runtime lifecycle
// data, and workspace task definitions are re-normalized on every save
// and load (which would strip foreign fields). A parallel localStorage
// registry survives reloads so the boot-time GC knows which definitions
// are finished agent one-shots and can prune them.
const AGENT_TASKS_KEY = "gear-shell-agent-tasks";

function loadAgentTaskRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_TASKS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAgentTaskRegistry(registry) {
  try {
    localStorage.setItem(AGENT_TASKS_KEY, JSON.stringify(registry));
  } catch {
    // storage unavailable; GC simply has nothing to prune next boot
  }
}

export function markAgentTask(defId) {
  if (!defId) return;
  const registry = loadAgentTaskRegistry();
  if (!registry[defId]) {
    registry[defId] = { status: "", ts: Date.now() };
    saveAgentTaskRegistry(registry);
  }
}

export function markAgentTaskStatus(defId, status) {
  if (!defId) return;
  const registry = loadAgentTaskRegistry();
  // Only tracked (persisted agent-managed) definitions; ephemeral tasks
  // are never in the registry, so nothing to record.
  if (!registry[defId] || registry[defId].status === status) return;
  registry[defId] = { ...registry[defId], status, ts: Date.now() };
  saveAgentTaskRegistry(registry);
}

// Boot-time GC: drop persisted agent-managed task definitions that reached
// a terminal status (succeeded/failed/cancelled), and forget registry
// entries whose definition no longer exists. Called from app-shell at
// startup, before any task panels are restored. Settings-created tasks are
// never tracked and never pruned.
export function gcWorkspaceTasks() {
  const workspace = loadActiveWorkspace();
  if (!Array.isArray(workspace.tasks)) return;
  const registry = loadAgentTaskRegistry();
  const terminal = new Set(["succeeded", "failed", "cancelled"]);
  let pruned = false;
  const surviving = workspace.tasks.filter((task) => {
    const entry = registry[task.id];
    if (entry && terminal.has(entry.status)) {
      pruned = true;
      return false;
    }
    return true;
  });
  if (pruned) {
    workspace.tasks = surviving;
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  }
  let registryPruned = false;
  for (const defId of Object.keys(registry)) {
    if (!surviving.some((task) => task.id === defId)) {
      delete registry[defId];
      registryPruned = true;
    }
  }
  if (registryPruned) saveAgentTaskRegistry(registry);
}
