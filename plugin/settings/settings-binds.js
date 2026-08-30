// Task mounts (binds) section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.3";
import { html } from "../../dom-html.js?v=20260830.2";

function queryBindElements(settingsContent) {
  return {
    list: settingsContent.querySelector("[data-bind-list]"),
    typeEl: settingsContent.querySelector('[data-bind="type"]'),
    dstEl: settingsContent.querySelector('[data-bind="dst"]'),
    srcEl: settingsContent.querySelector('[data-bind="src"]'),
    contentEl: settingsContent.querySelector('[data-bind="content"]'),
    permEl: settingsContent.querySelector('[data-bind="perm"]'),
    unionEl: settingsContent.querySelector('[data-bind="union"]'),
    status: settingsContent.querySelector('[data-bind="status"]'),
    addButton: settingsContent.querySelector('[data-bind-action="add"]'),
    cancelButton: settingsContent.querySelector('[data-bind-action="cancel"]'),
  };
}

function createBindFields(els, state, setStatus) {
  const resetFields = () => {
    state.editingBindId = null;
    els.typeEl.value = "ns";
    els.dstEl.value = "";
    els.srcEl.value = "";
    els.contentEl.value = "";
    els.permEl.value = "0644";
    els.unionEl.value = "after";
    els.addButton.textContent = "Add mount";
    els.cancelButton.hidden = true;
  };
  const populateFields = (bind) => {
    state.editingBindId = bind.id;
    els.typeEl.value = bind.type;
    els.dstEl.value = bind.dst;
    els.srcEl.value = bind.src;
    els.contentEl.value = bind.content;
    els.permEl.value = bind.perm;
    els.unionEl.value = bind.union;
    els.addButton.textContent = "Save mount";
    els.cancelButton.hidden = false;
    setStatus(`Editing ${bind.dst}.`);
    els.dstEl.focus();
  };
  return { resetFields, populateFields };
}

function createBindItemButtons(
  els,
  bind,
  state,
  setStatus,
  populateFields,
  resetFields,
) {
  return html`<div className="bind-item-actions">
    <button type="button" onclick=${() => populateFields(bind)}>Edit</button>
    <button
      type="button"
      onclick=${() => {
        if (state.editingBindId === bind.id) resetFields();
        settingsDep("removeWorkspaceBind")(bind.id);
        setStatus(`Removed ${bind.dst}.`);
      }}
    >Remove</button>
  </div>`;
}

function renderBindList(els, state, setStatus, populateFields, resetFields) {
  els.list.replaceChildren();
  const workspace = settingsDep("loadActiveWorkspace")();
  if (workspace.binds.length === 0) {
    els.list.appendChild(html`<span className="hint">No mounts yet.</span>`);
    return;
  }
  for (const bind of workspace.binds) {
    const path = html`<span className="bind-item-path">${
      `${bind.dst} ← ${bind.src || "inline content"}`
    }</span>`;
    path.title = path.textContent;
    const details = html`<div>
      ${path}
      <span className="bind-item-meta">${
        `${bind.type} · ${bind.perm} · ${bind.union}`
      }</span>
    </div>`;
    const item = html`<div className="bind-item">${
      details
    }${createBindItemButtons(
      els,
      bind,
      state,
      setStatus,
      populateFields,
      resetFields,
    )}</div>`;
    settingsDep("makeBindItemDraggable")(item, bind, {
      list: els.list,
      getDraggedId: () => state.draggedBindId,
      setDraggedId: (id) => {
        state.draggedBindId = id;
      },
      reorder: settingsDep("reorderWorkspaceBinds"),
      onReordered: () => setStatus("Mount order saved."),
    });
    els.list.appendChild(item);
  }
}

function wireBindButtons(els, state, setStatus, resetFields) {
  els.addButton.addEventListener("click", () => {
    try {
      const values = {
        type: els.typeEl.value,
        dst: els.dstEl.value,
        src: els.srcEl.value,
        content: els.contentEl.value,
        perm: els.permEl.value,
        union: els.unionEl.value,
      };
      const bind = state.editingBindId
        ? settingsDep("updateWorkspaceBind")(state.editingBindId, values)
        : settingsDep("addWorkspaceBind")(values);
      if (!bind) throw new Error("Unable to save the mount.");
      setStatus(
        `${
          state.editingBindId ? "Updated" : "Added"
        } ${els.dstEl.value.trim()}.`,
      );
      resetFields();
    } catch (error) {
      setStatus(error.message || "Unable to add mount.", true);
    }
  });
  els.cancelButton.addEventListener("click", () => {
    resetFields();
    setStatus("Edit cancelled.");
  });
}

export function setupBindForm(settingsContent) {
  const els = queryBindElements(settingsContent);
  if (
    !els.list || !els.typeEl || !els.dstEl || !els.srcEl || !els.contentEl ||
    !els.permEl || !els.unionEl || !els.status || !els.addButton ||
    !els.cancelButton
  ) return;
  const state = { editingBindId: null, draggedBindId: null };
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const { resetFields, populateFields } = createBindFields(
    els,
    state,
    setStatus,
  );
  const render = () =>
    renderBindList(els, state, setStatus, populateFields, resetFields);
  wireBindButtons(els, state, setStatus, resetFields);
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
