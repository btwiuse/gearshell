// Tasks section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.3";

function queryTaskElements(settingsContent) {
  return {
    list: settingsContent.querySelector("[data-task-list]"),
    nameEl: settingsContent.querySelector('[data-task="name"]'),
    cmdEl: settingsContent.querySelector('[data-task="cmd"]'),
    typeEl: settingsContent.querySelector('[data-task="type"]'),
    wdEl: settingsContent.querySelector('[data-task="wd"]'),
    envEl: settingsContent.querySelector('[data-task="env"]'),
    termEl: settingsContent.querySelector('[data-task="term"]'),
    autoStartEl: settingsContent.querySelector('[data-task="auto-start"]'),
    status: settingsContent.querySelector('[data-task="status"]'),
    addButton: settingsContent.querySelector('[data-task-action="add"]'),
    cancelButton: settingsContent.querySelector('[data-task-action="cancel"]'),
  };
}

function createTaskFields(els, state, setStatus) {
  const resetFields = () => {
    state.editingTaskId = null;
    els.nameEl.value = "";
    els.cmdEl.value = "";
    els.typeEl.value = "auto";
    els.wdEl.value = ".";
    els.envEl.value = "";
    els.termEl.checked = true;
    els.autoStartEl.checked = false;
    els.addButton.textContent = "Add task";
    els.cancelButton.hidden = true;
  };
  const populateFields = (task) => {
    state.editingTaskId = task.id;
    els.nameEl.value = task.name;
    els.cmdEl.value = task.cmd;
    els.typeEl.value = task.type;
    els.wdEl.value = task.wd;
    els.envEl.value = task.env;
    els.termEl.checked = task.term;
    els.autoStartEl.checked = task.autoStart;
    els.addButton.textContent = "Save task";
    els.cancelButton.hidden = false;
    setStatus(`Editing ${task.name}. Changes apply to future runs.`);
    els.nameEl.focus();
  };
  return { resetFields, populateFields };
}

function createTaskItemButtons(
  task,
  workspace,
  containerApi,
  state,
  setStatus,
  resetFields,
  populateFields,
) {
  const actions = document.createElement("div");
  actions.className = "task-item-actions";
  const run = document.createElement("button");
  run.type = "button";
  run.textContent = "Run";
  run.addEventListener("click", () => {
    if (!containerApi) {
      setStatus("The task host is not available.", true);
      return;
    }
    settingsDep("addWorkspaceTaskPanel")(containerApi, task, workspace);
    setStatus(`Started ${task.name}.`);
  });
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => populateFields(task));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    if (state.editingTaskId === task.id) resetFields();
    settingsDep("removeWorkspaceTask")(task.id);
    setStatus(`Removed ${task.name}.`);
  });
  actions.append(run, edit, remove);
  return actions;
}

function renderTaskList(
  els,
  state,
  containerApi,
  setStatus,
  resetFields,
  populateFields,
) {
  els.list.replaceChildren();
  const workspace = settingsDep("loadActiveWorkspace")();
  if (workspace.tasks.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No tasks yet.";
    els.list.appendChild(empty);
    return;
  }
  for (const task of workspace.tasks) {
    const item = document.createElement("div");
    item.className = "task-item";
    const details = document.createElement("div");
    const name = document.createElement("span");
    name.className = "task-item-name";
    name.textContent = task.name;
    name.title = task.cmd;
    const meta = document.createElement("span");
    meta.className = "task-item-meta";
    meta.textContent = `${task.type} · ${task.term ? "terminal" : "headless"}${
      task.autoStart ? " · auto-start" : ""
    } · ${task.cmd}`;
    meta.title = meta.textContent;
    details.append(name, meta);
    item.append(
      details,
      createTaskItemButtons(
        task,
        workspace,
        containerApi,
        state,
        setStatus,
        resetFields,
        populateFields,
      ),
    );
    els.list.appendChild(item);
  }
}

function wireTaskButtons(els, state, setStatus, resetFields) {
  els.addButton.addEventListener("click", () => {
    try {
      const currentTask = state.editingTaskId
        ? settingsDep("loadActiveWorkspace")().tasks.find((task) =>
          task.id === state.editingTaskId
        )
        : null;
      const values = {
        name: els.nameEl.value.trim() || els.cmdEl.value.trim() || "Task",
        cmd: els.cmdEl.value,
        type: els.typeEl.value,
        wd: els.wdEl.value,
        env: els.envEl.value,
        fsys: currentTask?.fsys || "",
        term: els.termEl.checked,
        autoStart: els.autoStartEl.checked,
      };
      const task = state.editingTaskId
        ? settingsDep("updateWorkspaceTask")(state.editingTaskId, values)
        : settingsDep("addWorkspaceTask")(values);
      if (!task) throw new Error("Unable to save the task.");
      setStatus(`${state.editingTaskId ? "Updated" : "Added"} ${task.name}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || "Unable to add task.", true);
    }
  });
  els.cancelButton.addEventListener("click", () => {
    resetFields();
    setStatus("Edit cancelled.");
  });
}

export function setupTaskForm(settingsContent, containerApi) {
  const els = queryTaskElements(settingsContent);
  if (
    !els.list || !els.nameEl || !els.cmdEl || !els.typeEl || !els.wdEl ||
    !els.envEl || !els.termEl || !els.autoStartEl || !els.status ||
    !els.addButton || !els.cancelButton
  ) return;
  const state = { editingTaskId: null };
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const { resetFields, populateFields } = createTaskFields(
    els,
    state,
    setStatus,
  );
  const render = () =>
    renderTaskList(
      els,
      state,
      containerApi,
      setStatus,
      resetFields,
      populateFields,
    );
  wireTaskButtons(els, state, setStatus, resetFields);
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
