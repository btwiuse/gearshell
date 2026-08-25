// Tasks section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.1";
export function setupTaskForm(settingsContent, containerApi) {
  const list = settingsContent.querySelector("[data-task-list]");
  const nameEl = settingsContent.querySelector('[data-task="name"]');
  const cmdEl = settingsContent.querySelector('[data-task="cmd"]');
  const typeEl = settingsContent.querySelector('[data-task="type"]');
  const wdEl = settingsContent.querySelector('[data-task="wd"]');
  const envEl = settingsContent.querySelector('[data-task="env"]');
  const termEl = settingsContent.querySelector('[data-task="term"]');
  const autoStartEl = settingsContent.querySelector('[data-task="auto-start"]');
  const status = settingsContent.querySelector('[data-task="status"]');
  const addButton = settingsContent.querySelector('[data-task-action="add"]');
  const cancelButton = settingsContent.querySelector(
    '[data-task-action="cancel"]',
  );
  if (
    !list || !nameEl || !cmdEl || !typeEl || !wdEl || !envEl || !termEl ||
    !autoStartEl || !status || !addButton || !cancelButton
  ) return;

  let editingTaskId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const render = () => {
    list.replaceChildren();
    const workspace = settingsDep("loadActiveWorkspace")();
    if (workspace.tasks.length === 0) {
      const empty = document.createElement("span");
      empty.className = "hint";
      empty.textContent = "No tasks yet.";
      list.appendChild(empty);
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
      meta.textContent = `${task.type} · ${
        task.term ? "terminal" : "headless"
      }${task.autoStart ? " · auto-start" : ""} · ${task.cmd}`;
      meta.title = meta.textContent;
      details.append(name, meta);

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
      edit.addEventListener("click", () => {
        editingTaskId = task.id;
        nameEl.value = task.name;
        cmdEl.value = task.cmd;
        typeEl.value = task.type;
        wdEl.value = task.wd;
        envEl.value = task.env;
        termEl.checked = task.term;
        autoStartEl.checked = task.autoStart;
        addButton.textContent = "Save task";
        cancelButton.hidden = false;
        setStatus(`Editing ${task.name}. Changes apply to future runs.`);
        nameEl.focus();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        if (editingTaskId === task.id) resetFields();
        settingsDep("removeWorkspaceTask")(task.id);
        setStatus(`Removed ${task.name}.`);
      });
      actions.append(run, edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const resetFields = () => {
    editingTaskId = null;
    nameEl.value = "";
    cmdEl.value = "";
    typeEl.value = "auto";
    wdEl.value = ".";
    envEl.value = "";
    termEl.checked = true;
    autoStartEl.checked = false;
    addButton.textContent = "Add task";
    cancelButton.hidden = true;
  };

  addButton.addEventListener("click", () => {
    try {
      const currentTask = editingTaskId
        ? settingsDep("loadActiveWorkspace")().tasks.find((task) =>
          task.id === editingTaskId
        )
        : null;
      const values = {
        name: nameEl.value.trim() || cmdEl.value.trim() || "Task",
        cmd: cmdEl.value,
        type: typeEl.value,
        wd: wdEl.value,
        env: envEl.value,
        fsys: currentTask?.fsys || "",
        term: termEl.checked,
        autoStart: autoStartEl.checked,
      };
      const task = editingTaskId
        ? settingsDep("updateWorkspaceTask")(editingTaskId, values)
        : settingsDep("addWorkspaceTask")(values);
      if (!task) throw new Error("Unable to save the task.");
      setStatus(`${editingTaskId ? "Updated" : "Added"} ${task.name}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || "Unable to add task.", true);
    }
  });
  cancelButton.addEventListener("click", () => {
    resetFields();
    setStatus("Edit cancelled.");
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
