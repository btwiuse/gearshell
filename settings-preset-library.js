// Workspace preset library section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.2";
// `setupPresetLibrary`, `setupWorkspaceForm`, and `setupSystemForm`
// wire the Workspace / Preset library / Runtime & system <details>
// blocks. All app.js globals they touch (the workspace store + system
// bind helpers, the workspace-changed event name, the Wanix runtime
// constant) are passed via the dep shim so these helpers stay loosely
// coupled to the rest of the shell.

export function setupPresetLibrary(settingsContent) {
  const list = settingsContent.querySelector("[data-preset-library-list]");
  const nameEl = settingsContent.querySelector('[data-preset-library="name"]');
  const descriptionEl = settingsContent.querySelector(
    '[data-preset-library="description"]',
  );
  const status = settingsContent.querySelector(
    '[data-preset-library="status"]',
  );
  const saveButton = settingsContent.querySelector(
    '[data-preset-library-action="save"]',
  );
  const updateButton = settingsContent.querySelector(
    '[data-preset-library-action="update"]',
  );
  const cancelButton = settingsContent.querySelector(
    '[data-preset-library-action="cancel"]',
  );
  if (
    !list || !nameEl || !descriptionEl || !status || !saveButton ||
    !updateButton || !cancelButton
  ) return;

  let editingPresetId = null;
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const resetFields = () => {
    editingPresetId = null;
    const workspace = settingsDep("loadActiveWorkspace")();
    nameEl.value = settingsDep("uniqueWorkspacePresetName")(
      `${workspace.name} preset`,
    );
    descriptionEl.value = workspace.description || "";
    saveButton.textContent = "Save current workspace as preset";
    updateButton.hidden = true;
    cancelButton.hidden = true;
  };
  const startEditing = (preset) => {
    editingPresetId = preset.id;
    nameEl.value = preset.name;
    descriptionEl.value = preset.description;
    saveButton.textContent = "Save preset details";
    updateButton.hidden = false;
    cancelButton.hidden = false;
    setStatus(`Editing ${preset.name}.`);
    nameEl.focus();
  };
  const render = () => {
    list.replaceChildren();
    const presets = settingsDep("listWorkspacePresets")().filter((preset) =>
      !preset.builtin
    );
    if (presets.length === 0) {
      const empty = document.createElement("span");
      empty.className = "hint";
      empty.textContent = "No custom presets yet.";
      list.appendChild(empty);
      return;
    }
    for (const preset of presets) {
      const item = document.createElement("div");
      item.className = "preset-library-item";
      const details = document.createElement("div");
      const name = document.createElement("span");
      name.className = "preset-library-name";
      name.textContent = preset.name;
      const meta = document.createElement("span");
      meta.className = "preset-library-meta";
      meta.textContent = preset.description || "Reusable workspace snapshot";
      details.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "preset-library-actions";
      const create = document.createElement("button");
      create.type = "button";
      create.textContent = "Create";
      create.addEventListener("click", () => {
        const workspace = settingsDep("createWorkspaceFromPreset")(preset.id);
        if (workspace) {
          setStatus(`Created ${workspace.name} from ${preset.name}.`);
        } else {setStatus(
            "Unable to create a workspace from this preset.",
            true,
          );}
      });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        const current = settingsDep("loadCustomWorkspacePreset")(preset.id);
        if (current) startEditing(current);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        if (
          !window.confirm(
            `Remove preset ${preset.name}? Existing workspaces will not be affected.`,
          )
        ) return;
        if (editingPresetId === preset.id) resetFields();
        if (settingsDep("removeCustomWorkspacePreset")(preset.id)) {
          setStatus(`Removed ${preset.name}.`);
        } else setStatus("Unable to remove the preset.", true);
      });
      actions.append(create, edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };

  saveButton.addEventListener("click", () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(editingPresetId, {
        name: nameEl.value,
        description: descriptionEl.value,
        workspace: editingPresetId
          ? undefined
          : settingsDep("loadActiveWorkspace")(),
      });
      const message = editingPresetId
        ? `Saved details for ${preset.name}.`
        : `Saved ${preset.name}.`;
      resetFields();
      setStatus(message);
    } catch (error) {
      setStatus(error.message || "Unable to save the preset.", true);
    }
  });
  updateButton.addEventListener("click", () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(editingPresetId, {
        name: nameEl.value,
        description: descriptionEl.value,
        workspace: settingsDep("loadActiveWorkspace")(),
      });
      setStatus(`Updated ${preset.name} from the current workspace.`);
    } catch (error) {
      setStatus(error.message || "Unable to update the preset.", true);
    }
  });
  cancelButton.addEventListener("click", () => {
    resetFields();
    setStatus("Edit cancelled.");
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  resetFields();
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
