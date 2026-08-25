// Task mounts (binds) section wiring.

import { settingsDep } from "./settings-deps.js?v=20260825.1";
export function setupBindForm(settingsContent) {
  const list = settingsContent.querySelector('[data-bind-list]');
  const typeEl = settingsContent.querySelector('[data-bind="type"]');
  const dstEl = settingsContent.querySelector('[data-bind="dst"]');
  const srcEl = settingsContent.querySelector('[data-bind="src"]');
  const contentEl = settingsContent.querySelector('[data-bind="content"]');
  const permEl = settingsContent.querySelector('[data-bind="perm"]');
  const unionEl = settingsContent.querySelector('[data-bind="union"]');
  const status = settingsContent.querySelector('[data-bind="status"]');
  const addButton = settingsContent.querySelector('[data-bind-action="add"]');
  const cancelButton = settingsContent.querySelector('[data-bind-action="cancel"]');
  if (!list || !typeEl || !dstEl || !srcEl || !contentEl || !permEl || !unionEl || !status || !addButton || !cancelButton) return;

  let editingBindId = null;
  let draggedBindId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? '#f85149' : '#8b949e';
  };
  const render = () => {
    list.replaceChildren();
    const workspace = settingsDep("loadActiveWorkspace")();
    if (workspace.binds.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'hint';
      empty.textContent = 'No mounts yet.';
      list.appendChild(empty);
      return;
    }
    for (const bind of workspace.binds) {
      const item = document.createElement('div');
      item.className = 'bind-item';
      settingsDep("makeBindItemDraggable")(item, bind, {
        list,
        getDraggedId: () => draggedBindId,
        setDraggedId: (id) => { draggedBindId = id; },
        reorder: settingsDep("reorderWorkspaceBinds"),
        onReordered: () => setStatus('Mount order saved.'),
      });
      const details = document.createElement('div');
      const path = document.createElement('span');
      path.className = 'bind-item-path';
      path.textContent = `${bind.dst} ← ${bind.src || 'inline content'}`;
      path.title = path.textContent;
      const meta = document.createElement('span');
      meta.className = 'bind-item-meta';
      meta.textContent = `${bind.type} · ${bind.perm} · ${bind.union}`;
      details.append(path, meta);
      const actions = document.createElement('div');
      actions.className = 'bind-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingBindId = bind.id;
        typeEl.value = bind.type;
        dstEl.value = bind.dst;
        srcEl.value = bind.src;
        contentEl.value = bind.content;
        permEl.value = bind.perm;
        unionEl.value = bind.union;
        addButton.textContent = 'Save mount';
        cancelButton.hidden = false;
        setStatus(`Editing ${bind.dst}.`);
        dstEl.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (editingBindId === bind.id) resetFields();
        settingsDep("removeWorkspaceBind")(bind.id);
        setStatus(`Removed ${bind.dst}.`);
      });
      actions.append(edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const resetFields = () => {
    editingBindId = null;
    typeEl.value = 'ns';
    dstEl.value = '';
    srcEl.value = '';
    contentEl.value = '';
    permEl.value = '0644';
    unionEl.value = 'after';
    addButton.textContent = 'Add mount';
    cancelButton.hidden = true;
  };

  addButton.addEventListener('click', () => {
    try {
      const values = {
        type: typeEl.value,
        dst: dstEl.value,
        src: srcEl.value,
        content: contentEl.value,
        perm: permEl.value,
        union: unionEl.value,
      };
      const bind = editingBindId
        ? settingsDep("updateWorkspaceBind")(editingBindId, values)
        : settingsDep("addWorkspaceBind")(values);
      if (!bind) throw new Error('Unable to save the mount.');
      setStatus(`${editingBindId ? 'Updated' : 'Added'} ${dstEl.value.trim()}.`);
      resetFields();
    } catch (error) {
      setStatus(error.message || 'Unable to add mount.', true);
    }
  });
  cancelButton.addEventListener('click', () => {
    resetFields();
    setStatus('Edit cancelled.');
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () => window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
