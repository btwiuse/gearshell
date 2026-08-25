// System form section wiring.

import { settingsDep } from "./settings-deps.js?v=20260826.2";
export function setupSystemForm(settingsContent) {
  const moduleEl = settingsContent.querySelector('[data-system="module"]');
  const wasmEl = settingsContent.querySelector('[data-system="wasm"]');
  const allowOriginsEl = settingsContent.querySelector(
    '[data-system="allow-origins"]',
  );
  const shareUrlEl = settingsContent.querySelector('[data-system="share-url"]');
  const list = settingsContent.querySelector("[data-system-bind-list]");
  const typeEl = settingsContent.querySelector('[data-system-bind="type"]');
  const dstEl = settingsContent.querySelector('[data-system-bind="dst"]');
  const srcEl = settingsContent.querySelector('[data-system-bind="src"]');
  const contentEl = settingsContent.querySelector(
    '[data-system-bind="content"]',
  );
  const modeEl = settingsContent.querySelector('[data-system-bind="mode"]');
  const unionEl = settingsContent.querySelector('[data-system-bind="union"]');
  const status = settingsContent.querySelector('[data-system="status"]');
  const saveButton = settingsContent.querySelector(
    '[data-system-action="save"]',
  );
  const restartButton = settingsContent.querySelector(
    '[data-system-action="restart"]',
  );
  const copyShareButton = settingsContent.querySelector(
    '[data-system-action="copy-share"]',
  );
  const addButton = settingsContent.querySelector(
    '[data-system-bind-action="add"]',
  );
  const cancelButton = settingsContent.querySelector(
    '[data-system-bind-action="cancel"]',
  );
  if (
    !moduleEl || !wasmEl || !allowOriginsEl || !shareUrlEl || !list ||
    !typeEl || !dstEl || !srcEl || !contentEl || !modeEl || !unionEl ||
    !status || !saveButton || !restartButton || !copyShareButton ||
    !addButton || !cancelButton
  ) return;

  let editingBindId = null;
  let draggedBindId = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? "#f85149" : "#8b949e";
  };
  const resetBindFields = () => {
    editingBindId = null;
    typeEl.value = "ns";
    dstEl.value = "";
    srcEl.value = "";
    contentEl.value = "";
    modeEl.value = "";
    unionEl.value = "after";
    addButton.textContent = "Add system mount";
    cancelButton.hidden = true;
  };
  const render = () => {
    const workspace = settingsDep("loadActiveWorkspace")();
    moduleEl.value = workspace.runtime.moduleUrl ||
      settingsDep("WANIX_RUNTIME").moduleUrl;
    wasmEl.value = workspace.runtime.wasmUrl ||
      settingsDep("WANIX_RUNTIME").wasmUrl;
    allowOriginsEl.value = workspace.system.allowOrigins || "";
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = "wanix-system";
    shareUrlEl.value = shareUrl.href;
    list.replaceChildren();
    for (const bind of workspace.system.binds) {
      const item = document.createElement("div");
      item.className = "bind-item";
      settingsDep("makeBindItemDraggable")(item, bind, {
        list,
        getDraggedId: () => draggedBindId,
        setDraggedId: (id) => {
          draggedBindId = id;
        },
        reorder: settingsDep("reorderWorkspaceSystemBinds"),
        onReordered: () =>
          setStatus("System mount order saved. Restart to apply changes."),
      });
      const details = document.createElement("div");
      const path = document.createElement("span");
      path.className = "bind-item-path";
      path.textContent = `${bind.dst} ← ${bind.src || "inline content"}`;
      path.title = path.textContent;
      const meta = document.createElement("span");
      meta.className = "bind-item-meta";
      meta.textContent = `${bind.type}${
        bind.mode ? ` · ${bind.mode}` : ""
      } · ${bind.union}`;
      details.append(path, meta);
      const actions = document.createElement("div");
      actions.className = "bind-item-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        editingBindId = bind.id;
        typeEl.value = bind.type;
        dstEl.value = bind.dst;
        srcEl.value = bind.src;
        contentEl.value = bind.content;
        modeEl.value = bind.mode;
        unionEl.value = bind.union;
        addButton.textContent = "Save system mount";
        cancelButton.hidden = false;
        setStatus(`Editing ${bind.dst}. Save and restart to apply changes.`);
        dstEl.focus();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        if (editingBindId === bind.id) resetBindFields();
        settingsDep("removeWorkspaceSystemBind")(bind.id);
        setStatus(`Removed ${bind.dst}. Restart to apply changes.`);
      });
      actions.append(edit, remove);
      item.append(details, actions);
      list.appendChild(item);
    }
  };
  const saveSettings = () => {
    settingsDep("saveWorkspaceSystemSettings")({
      moduleUrl: moduleEl.value,
      wasmUrl: wasmEl.value,
      allowOrigins: allowOriginsEl.value,
    });
    setStatus(
      "System settings saved. Restart the playground to apply changes.",
    );
  };

  saveButton.addEventListener("click", () => {
    try {
      saveSettings();
    } catch (error) {
      setStatus(error.message || "Unable to save system settings.", true);
    }
  });
  restartButton.addEventListener("click", () => {
    try {
      saveSettings();
      window.location.reload();
    } catch (error) {
      setStatus(error.message || "Unable to save system settings.", true);
    }
  });
  copyShareButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrlEl.value);
      setStatus("Namespace share URL copied.");
    } catch {
      shareUrlEl.focus();
      shareUrlEl.select();
      setStatus("Select the share URL and copy it manually.", true);
    }
  });
  addButton.addEventListener("click", () => {
    try {
      const bind = {
        type: typeEl.value,
        dst: dstEl.value,
        src: srcEl.value,
        content: contentEl.value,
        mode: modeEl.value,
        union: unionEl.value,
      };
      if (editingBindId) {
        settingsDep("updateWorkspaceSystemBind")(editingBindId, bind);
      } else settingsDep("addWorkspaceSystemBind")(bind);
      setStatus(
        `${
          editingBindId ? "Updated" : "Added"
        } ${dstEl.value.trim()}. Restart to apply changes.`,
      );
      resetBindFields();
    } catch (error) {
      setStatus(error.message || "Unable to save the system mount.", true);
    }
  });
  cancelButton.addEventListener("click", () => {
    resetBindFields();
    setStatus("Edit cancelled.");
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
  render();
  return () =>
    window.removeEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), render);
}
