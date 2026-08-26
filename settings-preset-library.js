// Workspace preset library section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.2";
// `setupPresetLibrary`, `setupWorkspaceForm`, and `setupSystemForm`
// wire the Workspace / Preset library / Runtime & system <details>
// blocks. All app.js globals they touch (the workspace store + system
// bind helpers, the workspace-changed event name, the Wanix runtime
// constant) are passed via the dep shim so these helpers stay loosely
// coupled to the rest of the shell.

function queryPresetLibraryElements(settingsContent) {
  return {
    list: settingsContent.querySelector("[data-preset-library-list]"),
    nameEl: settingsContent.querySelector('[data-preset-library="name"]'),
    descriptionEl: settingsContent.querySelector(
      '[data-preset-library="description"]',
    ),
    status: settingsContent.querySelector('[data-preset-library="status"]'),
    saveButton: settingsContent.querySelector(
      '[data-preset-library-action="save"]',
    ),
    updateButton: settingsContent.querySelector(
      '[data-preset-library-action="update"]',
    ),
    cancelButton: settingsContent.querySelector(
      '[data-preset-library-action="cancel"]',
    ),
  };
}

function createPresetLibraryFields(els, state, setStatus) {
  const resetFields = () => {
    state.editingPresetId = null;
    const workspace = settingsDep("loadActiveWorkspace")();
    els.nameEl.value = settingsDep("uniqueWorkspacePresetName")(
      `${workspace.name} preset`,
    );
    els.descriptionEl.value = workspace.description || "";
    els.saveButton.textContent = "Save current workspace as preset";
    els.updateButton.hidden = true;
    els.cancelButton.hidden = true;
  };
  const startEditing = (preset) => {
    state.editingPresetId = preset.id;
    els.nameEl.value = preset.name;
    els.descriptionEl.value = preset.description;
    els.saveButton.textContent = "Save preset details";
    els.updateButton.hidden = false;
    els.cancelButton.hidden = false;
    setStatus(`Editing ${preset.name}.`);
    els.nameEl.focus();
  };
  return { resetFields, startEditing };
}

function createPresetItemButtons(
  preset,
  state,
  setStatus,
  resetFields,
  startEditing,
) {
  const actions = document.createElement("div");
  actions.className = "preset-library-actions";
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "Create";
  create.addEventListener("click", () => {
    const workspace = settingsDep("createWorkspaceFromPreset")(preset.id);
    if (workspace) {
      setStatus(`Created ${workspace.name} from ${preset.name}.`);
    } else {
      setStatus("Unable to create a workspace from this preset.", true);
    }
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
    if (state.editingPresetId === preset.id) resetFields();
    if (settingsDep("removeCustomWorkspacePreset")(preset.id)) {
      setStatus(`Removed ${preset.name}.`);
    } else setStatus("Unable to remove the preset.", true);
  });
  actions.append(create, edit, remove);
  return actions;
}

function renderPresetLibraryList(
  els,
  state,
  setStatus,
  resetFields,
  startEditing,
) {
  els.list.replaceChildren();
  const presets = settingsDep("listWorkspacePresets")().filter((preset) =>
    !preset.builtin
  );
  if (presets.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No custom presets yet.";
    els.list.appendChild(empty);
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
    item.append(
      details,
      createPresetItemButtons(
        preset,
        state,
        setStatus,
        resetFields,
        startEditing,
      ),
    );
    els.list.appendChild(item);
  }
}

function wirePresetLibraryButtons(els, state, setStatus, resetFields) {
  els.saveButton.addEventListener("click", () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(
        state.editingPresetId,
        {
          name: els.nameEl.value,
          description: els.descriptionEl.value,
          workspace: state.editingPresetId
            ? undefined
            : settingsDep("loadActiveWorkspace")(),
        },
      );
      const message = state.editingPresetId
        ? `Saved details for ${preset.name}.`
        : `Saved ${preset.name}.`;
      resetFields();
      setStatus(message);
    } catch (error) {
      setStatus(error.message || "Unable to save the preset.", true);
    }
  });
  els.updateButton.addEventListener("click", () => {
    try {
      const preset = settingsDep("saveCustomWorkspacePreset")(
        state.editingPresetId,
        {
          name: els.nameEl.value,
          description: els.descriptionEl.value,
          workspace: settingsDep("loadActiveWorkspace")(),
        },
      );
      setStatus(`Updated ${preset.name} from the current workspace.`);
    } catch (error) {
      setStatus(error.message || "Unable to update the preset.", true);
    }
  });
  els.cancelButton.addEventListener("click", () => {
    resetFields();
    setStatus("Edit cancelled.");
  });
}

export function setupPresetLibrary(settingsContent) {
  const els = queryPresetLibraryElements(settingsContent);
  if (
    !els.list || !els.nameEl || !els.descriptionEl || !els.status ||
    !els.saveButton || !els.updateButton || !els.cancelButton
  ) return;
  const state = { editingPresetId: null };
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const { resetFields, startEditing } = createPresetLibraryFields(
    els,
    state,
    setStatus,
  );
  const render = () =>
    renderPresetLibraryList(els, state, setStatus, resetFields, startEditing);
  wirePresetLibraryButtons(els, state, setStatus, resetFields);
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  resetFields();
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
