// Workspace bind / system-bind / task CRUD + the shared drag-to-reorder
// helper (500-line rule split; re-exported through app-workspace.js).

import {
  SUPPORTED_SYSTEM_BIND_TYPES,
  SUPPORTED_UNION_MODES,
} from "./app-constants.js?v=20260828.23";
import {
  normalizeBind,
  normalizeSystemBind,
  normalizeSystemConfig,
  normalizeTask,
  validateBind,
  validateTask,
} from "./app-normalize.js?v=20260828.64";
import {
  loadActiveWorkspace,
  updateActiveWorkspace,
} from "./app-workspace-store.js?v=20260826.63";

export function addWorkspaceBind(bind) {
  const nextBind = normalizeBind(bind);
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.binds.push(nextBind));
}

export function removeWorkspaceBind(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.binds = workspace.binds.filter((bind) => bind.id !== id);
  });
}

export function updateWorkspaceBind(id, bind) {
  const nextBind = normalizeBind({ ...bind, id });
  const error = validateBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateActiveWorkspace((activeWorkspace) => {
    const index = activeWorkspace.binds.findIndex((item) => item.id === id);
    if (index !== -1) activeWorkspace.binds[index] = nextBind;
  });
  return workspace?.binds.find((item) => item.id === id) || null;
}

export function reorderWorkspaceBinds(sourceId, targetId, placeAfter) {
  return updateActiveWorkspace((workspace) => {
    const sourceIndex = workspace.binds.findIndex((bind) =>
      bind.id === sourceId
    );
    const targetIndex = workspace.binds.findIndex((bind) =>
      bind.id === targetId
    );
    if (
      sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex
    ) return;
    const [source] = workspace.binds.splice(sourceIndex, 1);
    const nextTargetIndex = workspace.binds.findIndex((bind) =>
      bind.id === targetId
    );
    workspace.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

export function validateSystemBind(bind) {
  if (!SUPPORTED_SYSTEM_BIND_TYPES.includes(bind.type)) {
    return "Unsupported system mount type.";
  }
  if (!bind.dst) return "A destination path is required.";
  if (bind.dst.startsWith("/")) {
    return "Destination paths must not start with a slash.";
  }
  if (bind.type === "ns" && !bind.src.startsWith("#")) {
    return "Namespace mounts must use a # system path.";
  }
  if (
    (bind.type === "fetch" || bind.type === "archive" ||
      bind.type === "import") && !bind.src
  ) return `${bind.type} mounts require a source URL.`;
  if (bind.type === "file" && !bind.src && !bind.content) {
    return "Provide a URL or inline file content.";
  }
  if (!SUPPORTED_UNION_MODES.includes(bind.union)) {
    return "Union position must be before or after.";
  }
  if (bind.mode && !/^[0-7]{3,4}$/.test(bind.mode)) {
    return "Permissions must be an octal mode such as 0644.";
  }
  return null;
}

export function updateWorkspaceSystem(mutator) {
  return updateActiveWorkspace((workspace) => {
    workspace.system = normalizeSystemConfig(workspace.system);
    mutator(workspace.system, workspace);
  });
}

export function saveWorkspaceSystemSettings(
  { moduleUrl, wasmUrl, allowOrigins },
) {
  const nextModuleUrl = moduleUrl.trim();
  const nextWasmUrl = wasmUrl.trim();
  if (!nextModuleUrl) {
    throw new Error("A Wanix runtime module URL is required.");
  }
  if (!nextWasmUrl) throw new Error("A Wanix wasm URL is required.");
  return updateWorkspaceSystem((system, workspace) => {
    workspace.runtime.moduleUrl = nextModuleUrl;
    workspace.runtime.wasmUrl = nextWasmUrl;
    system.allowOrigins = typeof allowOrigins === "string"
      ? allowOrigins.trim().replace(/[\s,]+/g, " ")
      : "";
  });
}

export function addWorkspaceSystemBind(bind) {
  const nextBind = normalizeSystemBind(bind);
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  return updateWorkspaceSystem((system) => system.binds.push(nextBind));
}

export function updateWorkspaceSystemBind(id, bind) {
  const nextBind = normalizeSystemBind({ ...bind, id });
  const error = validateSystemBind(nextBind);
  if (error) throw new Error(error);
  const workspace = updateWorkspaceSystem((system) => {
    const index = system.binds.findIndex((item) => item.id === id);
    if (index !== -1) system.binds[index] = nextBind;
  });
  return workspace?.system.binds.find((item) => item.id === id) || null;
}

export function removeWorkspaceSystemBind(id) {
  return updateWorkspaceSystem((system) => {
    system.binds = system.binds.filter((bind) => bind.id !== id);
  });
}

export function reorderWorkspaceSystemBinds(sourceId, targetId, placeAfter) {
  return updateWorkspaceSystem((system) => {
    const sourceIndex = system.binds.findIndex((bind) => bind.id === sourceId);
    const targetIndex = system.binds.findIndex((bind) => bind.id === targetId);
    if (
      sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex
    ) return;
    const [source] = system.binds.splice(sourceIndex, 1);
    const nextTargetIndex = system.binds.findIndex((bind) =>
      bind.id === targetId
    );
    system.binds.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  });
}

export function makeBindItemDraggable(
  item,
  bind,
  { list, getDraggedId, setDraggedId, reorder, onReordered },
) {
  item.draggable = true;
  item.title = "Drag to reorder";
  item.setAttribute("aria-label", `${bind.dst || "Unnamed mount"}, draggable`);

  const clearDropIndicators = () => {
    for (
      const candidate of list.querySelectorAll(
        ".bind-item.drop-before, .bind-item.drop-after",
      )
    ) {
      candidate.classList.remove("drop-before", "drop-after");
    }
  };
  item.addEventListener("dragstart", (event) => {
    setDraggedId(bind.id);
    item.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", bind.id);
    }
  });
  item.addEventListener("dragover", (event) => {
    if (!getDraggedId() || getDraggedId() === bind.id) return;
    event.preventDefault();
    const placeAfter =
      event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    clearDropIndicators();
    item.classList.add(placeAfter ? "drop-after" : "drop-before");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  item.addEventListener("drop", (event) => {
    const sourceId = getDraggedId();
    if (!sourceId || sourceId === bind.id) return;
    event.preventDefault();
    const placeAfter =
      event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    clearDropIndicators();
    setDraggedId(null);
    if (reorder(sourceId, bind.id, placeAfter)) onReordered();
  });
  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    clearDropIndicators();
    setDraggedId(null);
  });
}

export function addWorkspaceTask(task) {
  const nextTask = normalizeTask(task);
  const error = validateTask(nextTask);
  if (error) throw new Error(error);
  return updateActiveWorkspace((workspace) => workspace.tasks.push(nextTask));
}

export function removeWorkspaceTask(id) {
  return updateActiveWorkspace((workspace) => {
    workspace.tasks = workspace.tasks.filter((task) => task.id !== id);
  });
}

export function updateWorkspaceTask(id, task) {
  const current = loadActiveWorkspace().tasks.find((item) => item.id === id);
  if (!current) return null;
  const nextTask = normalizeTask({ ...current, ...task, id });
  const error = validateTask(nextTask);
  if (error) throw new Error(error);
  const workspace = updateActiveWorkspace((activeWorkspace) => {
    const index = activeWorkspace.tasks.findIndex((item) => item.id === id);
    if (index !== -1) activeWorkspace.tasks[index] = nextTask;
  });
  return workspace?.tasks.find((item) => item.id === id) || null;
}
