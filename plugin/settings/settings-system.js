// System form section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.3";
import { html } from "../../dom-html.js?v=20260830.4";

function querySystemElements(settingsContent) {
  return {
    moduleEl: settingsContent.querySelector('[data-system="module"]'),
    wasmEl: settingsContent.querySelector('[data-system="wasm"]'),
    allowOriginsEl: settingsContent.querySelector(
      '[data-system="allow-origins"]',
    ),
    shareUrlEl: settingsContent.querySelector('[data-system="share-url"]'),
    list: settingsContent.querySelector("[data-system-bind-list]"),
    typeEl: settingsContent.querySelector('[data-system-bind="type"]'),
    dstEl: settingsContent.querySelector('[data-system-bind="dst"]'),
    srcEl: settingsContent.querySelector('[data-system-bind="src"]'),
    contentEl: settingsContent.querySelector('[data-system-bind="content"]'),
    modeEl: settingsContent.querySelector('[data-system-bind="mode"]'),
    unionEl: settingsContent.querySelector('[data-system-bind="union"]'),
    status: settingsContent.querySelector('[data-system="status"]'),
    saveButton: settingsContent.querySelector('[data-system-action="save"]'),
    restartButton: settingsContent.querySelector(
      '[data-system-action="restart"]',
    ),
    copyShareButton: settingsContent.querySelector(
      '[data-system-action="copy-share"]',
    ),
    addButton: settingsContent.querySelector('[data-system-bind-action="add"]'),
    cancelButton: settingsContent.querySelector(
      '[data-system-bind-action="cancel"]',
    ),
  };
}

function createSystemBindFields(els, state) {
  const resetBindFields = () => {
    state.editingBindId = null;
    els.typeEl.value = "ns";
    els.dstEl.value = "";
    els.srcEl.value = "";
    els.contentEl.value = "";
    els.modeEl.value = "";
    els.unionEl.value = "after";
    els.addButton.textContent = "Add system mount";
    els.cancelButton.hidden = true;
  };
  const populateBindFields = (bind) => {
    state.editingBindId = bind.id;
    els.typeEl.value = bind.type;
    els.dstEl.value = bind.dst;
    els.srcEl.value = bind.src;
    els.contentEl.value = bind.content;
    els.modeEl.value = bind.mode;
    els.unionEl.value = bind.union;
    els.addButton.textContent = "Save system mount";
    els.cancelButton.hidden = false;
  };
  return { resetBindFields, populateBindFields };
}

function createBindItemButtons(
  els,
  bind,
  state,
  setStatus,
  populateBindFields,
  resetBindFields,
) {
  return html`<div className="bind-item-actions">
    <button
      type="button"
      onclick=${() => {
        populateBindFields(bind);
        setStatus(`Editing ${bind.dst}. Save and restart to apply changes.`);
        els.dstEl.focus();
      }}
    >Edit</button>
    <button
      type="button"
      onclick=${() => {
        if (state.editingBindId === bind.id) resetBindFields();
        settingsDep("removeWorkspaceSystemBind")(bind.id);
        setStatus(`Removed ${bind.dst}. Restart to apply changes.`);
      }}
    >Remove</button>
  </div>`;
}

function renderSystemBindItem(
  els,
  bind,
  state,
  setStatus,
  populateBindFields,
  resetBindFields,
) {
  const path = html`<span className="bind-item-path">${
    `${bind.dst} ← ${bind.src || "inline content"}`
  }</span>`;
  path.title = path.textContent;
  const details = html`<div>
    ${path}
    <span className="bind-item-meta">${
      `${bind.type}${bind.mode ? ` · ${bind.mode}` : ""} · ${bind.union}`
    }</span>
  </div>`;
  const item = html`<div className="bind-item">${
    details
  }${createBindItemButtons(
    els,
    bind,
    state,
    setStatus,
    populateBindFields,
    resetBindFields,
  )}</div>`;
  settingsDep("makeBindItemDraggable")(item, bind, {
    list: els.list,
    getDraggedId: () => state.draggedBindId,
    setDraggedId: (id) => {
      state.draggedBindId = id;
    },
    reorder: settingsDep("reorderWorkspaceSystemBinds"),
    onReordered: () =>
      setStatus("System mount order saved. Restart to apply changes."),
  });
  return item;
}

function renderSystemForm(
  els,
  state,
  setStatus,
  populateBindFields,
  resetBindFields,
) {
  const workspace = settingsDep("loadActiveWorkspace")();
  els.moduleEl.value = workspace.runtime.moduleUrl ||
    settingsDep("WANIX_RUNTIME").moduleUrl;
  els.wasmEl.value = workspace.runtime.wasmUrl ||
    settingsDep("WANIX_RUNTIME").wasmUrl;
  els.allowOriginsEl.value = workspace.system.allowOrigins || "";
  const shareUrl = new URL(window.location.href);
  shareUrl.hash = "wanix-system";
  els.shareUrlEl.value = shareUrl.href;
  els.list.replaceChildren();
  for (const bind of workspace.system.binds) {
    els.list.appendChild(
      renderSystemBindItem(
        els,
        bind,
        state,
        setStatus,
        populateBindFields,
        resetBindFields,
      ),
    );
  }
}

function saveSystemSettings(els, setStatus) {
  settingsDep("saveWorkspaceSystemSettings")({
    moduleUrl: els.moduleEl.value,
    wasmUrl: els.wasmEl.value,
    allowOrigins: els.allowOriginsEl.value,
  });
  setStatus(
    "System settings saved. Restart the playground to apply changes.",
  );
}

function wireSystemButtons(els, saveSettings) {
  els.saveButton.addEventListener("click", () => {
    try {
      saveSettings();
    } catch (error) {
      setStatus(error.message || "Unable to save system settings.", true);
    }
  });
  els.restartButton.addEventListener("click", () => {
    try {
      saveSettings();
      window.location.reload();
    } catch (error) {
      setStatus(error.message || "Unable to save system settings.", true);
    }
  });
  els.copyShareButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.shareUrlEl.value);
      setStatus("Namespace share URL copied.");
    } catch {
      els.shareUrlEl.focus();
      els.shareUrlEl.select();
      setStatus("Select the share URL and copy it manually.", true);
    }
  });
}

function wireSystemBindButtons(els, state, setStatus, resetBindFields) {
  els.addButton.addEventListener("click", () => {
    try {
      const bind = {
        type: els.typeEl.value,
        dst: els.dstEl.value,
        src: els.srcEl.value,
        content: els.contentEl.value,
        mode: els.modeEl.value,
        union: els.unionEl.value,
      };
      if (state.editingBindId) {
        settingsDep("updateWorkspaceSystemBind")(state.editingBindId, bind);
      } else settingsDep("addWorkspaceSystemBind")(bind);
      setStatus(
        `${
          state.editingBindId ? "Updated" : "Added"
        } ${els.dstEl.value.trim()}. Restart to apply changes.`,
      );
      resetBindFields();
    } catch (error) {
      setStatus(error.message || "Unable to save the system mount.", true);
    }
  });
  els.cancelButton.addEventListener("click", () => {
    resetBindFields();
    setStatus("Edit cancelled.");
  });
}

export function setupSystemForm(settingsContent) {
  const els = querySystemElements(settingsContent);
  if (
    !els.moduleEl || !els.wasmEl || !els.allowOriginsEl || !els.shareUrlEl ||
    !els.list || !els.typeEl || !els.dstEl || !els.srcEl || !els.contentEl ||
    !els.modeEl || !els.unionEl || !els.status || !els.saveButton ||
    !els.restartButton || !els.copyShareButton || !els.addButton ||
    !els.cancelButton
  ) return;
  const state = { editingBindId: null, draggedBindId: null };
  const setStatus = (message, isError = false) => {
    els.status.textContent = message;
    els.status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const { resetBindFields, populateBindFields } = createSystemBindFields(
    els,
    state,
  );
  const render = () =>
    renderSystemForm(
      els,
      state,
      setStatus,
      populateBindFields,
      resetBindFields,
    );
  const saveSettings = () => saveSystemSettings(els, setStatus);
  wireSystemButtons(els, saveSettings);
  wireSystemBindButtons(els, state, setStatus, resetBindFields);
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
