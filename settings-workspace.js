// Workspace form section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.2";

function queryWorkspaceElements(settingsContent) {
  return {
    activeSelect: settingsContent.querySelector('[data-workspace="active"]'),
    nameInput: settingsContent.querySelector('[data-workspace="name"]'),
    presetSelect: settingsContent.querySelector('[data-workspace="preset"]'),
    status: settingsContent.querySelector('[data-workspace="status"]'),
    jsonEl: settingsContent.querySelector('[data-workspace="json"]'),
    jsonStatus: settingsContent.querySelector('[data-workspace="json-status"]'),
    jsonFileInput: settingsContent.querySelector(
      '[data-workspace="json-file"]',
    ),
    deleteButton: settingsContent.querySelector(
      '[data-workspace-action="delete"]',
    ),
  };
}

function createWorkspaceStatusSetters(els) {
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const setJsonStatus = (message, isError = false) => {
    els.jsonStatus.textContent = message;
    els.jsonStatus.style.color = isError ? "#f85149" : "#8b949e";
  };
  return { setStatus, setJsonStatus };
}

function createWorkspaceJsonEditor(els, setJsonStatus) {
  const state = { dirty: false, workspaceId: null };
  const validateJson = () => {
    try {
      const workspace = settingsDep("parseWorkspaceJson")(els.jsonEl.value);
      setJsonStatus(
        `${workspace.name} · v${workspace.version} · ${workspace.system.binds.length} system mounts · ${workspace.binds.length} mounts · ${workspace.tasks.length} tasks`,
      );
      return workspace;
    } catch (error) {
      setJsonStatus(error.message || "Workspace JSON is invalid.", true);
      return null;
    }
  };
  const loadCurrentJson = () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    els.jsonEl.value = JSON.stringify(workspace, null, 2);
    state.workspaceId = workspace.id;
    state.dirty = false;
    validateJson();
  };
  return { state, validateJson, loadCurrentJson };
}

function addOption(select, value, label, selected) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.appendChild(option);
}

function renderWorkspaceForm(els, state, loadCurrentJson) {
  const activeId = settingsDep("getActiveWorkspaceId")();
  els.activeSelect.replaceChildren();
  for (const workspace of settingsDep("ensureWorkspaceStore")()) {
    addOption(
      els.activeSelect,
      workspace.id,
      workspace.name,
      workspace.id === activeId,
    );
  }
  const workspace = settingsDep("loadActiveWorkspace")();
  els.nameInput.value = workspace.name;
  if (!state.dirty || state.workspaceId !== workspace.id) loadCurrentJson();
  els.presetSelect.replaceChildren();
  for (const preset of settingsDep("listWorkspacePresets")()) {
    addOption(
      els.presetSelect,
      preset.id,
      preset.name,
      preset.id === "hush-shell",
    );
  }
  if (els.deleteButton) {
    els.deleteButton.disabled = activeId === "hush-shell" ||
      els.activeSelect.options.length <= 1;
  }
}

function wireWorkspaceButtons(settingsContent, els, setStatus) {
  els.activeSelect.addEventListener("change", () => {
    if (settingsDep("setActiveWorkspaceId")(els.activeSelect.value)) {
      setStatus("Workspace selected.");
    } else setStatus("Unable to select this workspace.", true);
  });
  settingsContent.querySelector('[data-workspace-action="rename"]')
    .addEventListener("click", () => {
      try {
        const workspace = settingsDep("renameWorkspace")(
          settingsDep("getActiveWorkspaceId")(),
          els.nameInput.value,
        );
        setStatus(`Renamed workspace to ${workspace.name}.`);
      } catch (error) {
        setStatus(error.message || "Unable to rename workspace.", true);
      }
    });
  settingsContent.querySelector('[data-workspace-action="create"]')
    .addEventListener("click", () => {
      const workspace = settingsDep("createWorkspaceFromPreset")(
        els.presetSelect.value,
      );
      if (workspace) setStatus(`Created ${workspace.name}.`);
      else setStatus("Unable to create workspace.", true);
    });
  settingsContent.querySelector('[data-workspace-action="duplicate"]')
    .addEventListener("click", () => {
      const workspace = settingsDep("duplicateWorkspace")(
        settingsDep("getActiveWorkspaceId")(),
      );
      if (workspace) setStatus(`Created ${workspace.name}.`);
      else setStatus("Unable to duplicate workspace.", true);
    });
  settingsContent.querySelector('[data-workspace-action="delete"]')
    .addEventListener("click", () => {
      const workspace = settingsDep("loadActiveWorkspace")();
      if (!window.confirm(`Delete ${workspace.name}?`)) return;
      if (settingsDep("deleteWorkspace")(workspace.id)) {
        setStatus(`Deleted ${workspace.name}.`);
      } else setStatus("The default workspace cannot be deleted.", true);
    });
}

function wireWorkspaceJsonButtons(
  settingsContent,
  els,
  { setStatus, validateJson, loadCurrentJson },
) {
  settingsContent.querySelector('[data-workspace-action="json-reset"]')
    .addEventListener("click", () => {
      loadCurrentJson();
      setStatus("Loaded the saved workspace JSON.");
    });
  settingsContent.querySelector('[data-workspace-action="json-copy"]')
    .addEventListener("click", async () => {
      if (!validateJson()) return;
      try {
        await navigator.clipboard.writeText(els.jsonEl.value);
        setStatus("Workspace JSON copied.");
      } catch {
        setStatus(
          "Unable to copy. Select the JSON and copy it manually.",
          true,
        );
        els.jsonEl.focus();
        els.jsonEl.select();
      }
    });
  settingsContent.querySelector('[data-workspace-action="json-download"]')
    .addEventListener("click", () => {
      const workspace = validateJson();
      if (!workspace) return;
      const blob = new Blob([els.jsonEl.value], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const download = document.createElement("a");
      download.href = url;
      download.download = `${
        workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workspace"
      }.json`;
      download.click();
      URL.revokeObjectURL(url);
      setStatus("Workspace JSON downloaded.");
    });
}

function wireWorkspaceJsonActions(settingsContent, els, { setStatus, state }) {
  settingsContent.querySelector('[data-workspace-action="json-create"]')
    .addEventListener("click", () => {
      try {
        const workspace = settingsDep("importWorkspace")(els.jsonEl.value);
        state.dirty = false;
        setStatus(`Created ${workspace.name} from JSON.`);
      } catch (error) {
        setStatus(error.message || "Unable to create workspace.", true);
      }
    });
  settingsContent.querySelector('[data-workspace-action="json-replace"]')
    .addEventListener("click", () => {
      const current = settingsDep("loadActiveWorkspace")();
      if (
        !window.confirm(`Replace ${current.name} with the JSON in this editor?`)
      ) return;
      try {
        const workspace = settingsDep("replaceActiveWorkspace")(
          els.jsonEl.value,
        );
        state.dirty = false;
        setStatus(`Replaced the current workspace with ${workspace.name}.`);
      } catch (error) {
        setStatus(error.message || "Unable to replace workspace.", true);
      }
    });
}

function wireWorkspaceJsonInputs(
  settingsContent,
  els,
  { setStatus, validateJson, state },
) {
  els.jsonEl.addEventListener("input", () => {
    state.dirty = true;
    validateJson();
  });
  els.jsonFileInput.addEventListener("change", async () => {
    const [file] = els.jsonFileInput.files || [];
    if (!file) return;
    try {
      els.jsonEl.value = await file.text();
      state.dirty = true;
      const workspace = validateJson();
      if (workspace) {
        setStatus(
          `Loaded ${workspace.name}. Review it, then choose how to apply it.`,
        );
      }
    } catch (error) {
      setStatus(error.message || "Unable to read workspace JSON.", true);
    } finally {
      els.jsonFileInput.value = "";
    }
  });
}

export function setupWorkspaceForm(settingsContent) {
  const els = queryWorkspaceElements(settingsContent);
  if (
    !els.activeSelect || !els.nameInput || !els.presetSelect || !els.status ||
    !els.jsonEl || !els.jsonStatus || !els.jsonFileInput
  ) return;
  const { setStatus, setJsonStatus } = createWorkspaceStatusSetters(els);
  const json = createWorkspaceJsonEditor(els, setJsonStatus);
  const render = () =>
    renderWorkspaceForm(els, json.state, json.loadCurrentJson);
  wireWorkspaceButtons(settingsContent, els, setStatus);
  wireWorkspaceJsonButtons(settingsContent, els, {
    setStatus,
    validateJson: json.validateJson,
    loadCurrentJson: json.loadCurrentJson,
  });
  wireWorkspaceJsonActions(settingsContent, els, {
    setStatus,
    state: json.state,
  });
  wireWorkspaceJsonInputs(settingsContent, els, {
    setStatus,
    validateJson: json.validateJson,
    state: json.state,
  });
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
