// Workspace form section wiring.

import { settingsDep } from "./settings-deps.js?v=20260825.1";
export function setupWorkspaceForm(settingsContent) {
  const activeSelect = settingsContent.querySelector('[data-workspace="active"]');
  const nameInput = settingsContent.querySelector('[data-workspace="name"]');
  const presetSelect = settingsContent.querySelector('[data-workspace="preset"]');
  const status = settingsContent.querySelector('[data-workspace="status"]');
  const jsonEl = settingsContent.querySelector('[data-workspace="json"]');
  const jsonStatus = settingsContent.querySelector('[data-workspace="json-status"]');
  const jsonFileInput = settingsContent.querySelector('[data-workspace="json-file"]');
  const deleteButton = settingsContent.querySelector('[data-workspace-action="delete"]');
  if (!activeSelect || !nameInput || !presetSelect || !status || !jsonEl || !jsonStatus || !jsonFileInput) return;

  let jsonDirty = false;
  let jsonWorkspaceId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const setJsonStatus = (message, isError = false) => {
    jsonStatus.textContent = message;
    jsonStatus.style.color = isError ? '#f85149' : '#8b949e';
  };
  const validateJson = () => {
    try {
      const workspace = settingsDep("parseWorkspaceJson")(jsonEl.value);
      setJsonStatus(`${workspace.name} · v${workspace.version} · ${workspace.system.binds.length} system mounts · ${workspace.binds.length} mounts · ${workspace.tasks.length} tasks`);
      return workspace;
    } catch (error) {
      setJsonStatus(error.message || 'Workspace JSON is invalid.', true);
      return null;
    }
  };
  const loadCurrentJson = () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    jsonEl.value = JSON.stringify(workspace, null, 2);
    jsonWorkspaceId = workspace.id;
    jsonDirty = false;
    validateJson();
  };
  const addOption = (select, value, label, selected) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
  };
  const render = () => {
    const activeId = settingsDep("getActiveWorkspaceId")();
    activeSelect.replaceChildren();
    for (const workspace of settingsDep("ensureWorkspaceStore")()) {
      addOption(activeSelect, workspace.id, workspace.name, workspace.id === activeId);
    }
    const workspace = settingsDep("loadActiveWorkspace")();
    nameInput.value = workspace.name;
    if (!jsonDirty || jsonWorkspaceId !== workspace.id) loadCurrentJson();
    presetSelect.replaceChildren();
    for (const preset of settingsDep("listWorkspacePresets")()) {
      addOption(presetSelect, preset.id, preset.name, preset.id === 'hush-shell');
    }
    if (deleteButton) {
      deleteButton.disabled = activeId === 'hush-shell' || activeSelect.options.length <= 1;
    }
  };

  activeSelect.addEventListener('change', () => {
    if (settingsDep("setActiveWorkspaceId")(activeSelect.value)) setStatus('Workspace selected.');
    else setStatus('Unable to select this workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="rename"]').addEventListener('click', () => {
    try {
      const workspace = settingsDep("renameWorkspace")(settingsDep("getActiveWorkspaceId")(), nameInput.value);
      setStatus(`Renamed workspace to ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to rename workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="create"]').addEventListener('click', () => {
    const workspace = settingsDep("createWorkspaceFromPreset")(presetSelect.value);
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to create workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="duplicate"]').addEventListener('click', () => {
    const workspace = settingsDep("duplicateWorkspace")(settingsDep("getActiveWorkspaceId")());
    if (workspace) setStatus(`Created ${workspace.name}.`);
    else setStatus('Unable to duplicate workspace.', true);
  });
  settingsContent.querySelector('[data-workspace-action="delete"]').addEventListener('click', () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    if (!window.confirm(`Delete ${workspace.name}?`)) return;
    if (settingsDep("deleteWorkspace")(workspace.id)) setStatus(`Deleted ${workspace.name}.`);
    else setStatus('The default workspace cannot be deleted.', true);
  });
  settingsContent.querySelector('[data-workspace-action="json-reset"]').addEventListener('click', () => {
    loadCurrentJson();
    setStatus('Loaded the saved workspace JSON.');
  });
  settingsContent.querySelector('[data-workspace-action="json-copy"]').addEventListener('click', async () => {
    if (!validateJson()) return;
    try {
      await navigator.clipboard.writeText(jsonEl.value);
      setStatus('Workspace JSON copied.');
    } catch {
      setStatus('Unable to copy. Select the JSON and copy it manually.', true);
      jsonEl.focus();
      jsonEl.select();
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-download"]').addEventListener('click', () => {
    const workspace = validateJson();
    if (!workspace) return;
    const blob = new Blob([jsonEl.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workspace'}.json`;
    download.click();
    URL.revokeObjectURL(url);
    setStatus('Workspace JSON downloaded.');
  });
  jsonEl.addEventListener('input', () => {
    jsonDirty = true;
    validateJson();
  });
  jsonFileInput.addEventListener('change', async () => {
    const [file] = jsonFileInput.files || [];
    if (!file) return;
    try {
      jsonEl.value = await file.text();
      jsonDirty = true;
      const workspace = validateJson();
      if (workspace) setStatus(`Loaded ${workspace.name}. Review it, then choose how to apply it.`);
    } catch (error) {
      setStatus(error.message || 'Unable to read workspace JSON.', true);
    } finally {
      jsonFileInput.value = '';
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-create"]').addEventListener('click', () => {
    try {
      const workspace = settingsDep("importWorkspace")(jsonEl.value);
      jsonDirty = false;
      setStatus(`Created ${workspace.name} from JSON.`);
    } catch (error) {
      setStatus(error.message || 'Unable to create workspace.', true);
    }
  });
  settingsContent.querySelector('[data-workspace-action="json-replace"]').addEventListener('click', () => {
    const current = settingsDep("loadActiveWorkspace")();
    if (!window.confirm(`Replace ${current.name} with the JSON in this editor?`)) return;
    try {
      const workspace = settingsDep("replaceActiveWorkspace")(jsonEl.value);
      jsonDirty = false;
      setStatus(`Replaced the current workspace with ${workspace.name}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to replace workspace.', true);
    }
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
