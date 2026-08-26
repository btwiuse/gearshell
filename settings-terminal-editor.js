// Terminal preset editor + profile form wiring.

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { settingsDep } from "./settings-deps.js?v=20260826.2";
// auto-start). `TerminalPresetEditor` is the React sub-component
// that manages the built-in terminal preset catalog (Terminal,
// Crush, custom entries) — list, drag-reorder, edit, add, remove.
// All app.js globals they touch (workspace / bind / task helpers,
// terminal profile loaders, the WORKSPACE_CHANGED_EVENT constant,
// the TerminalPresetIconPicker React component) are passed via the
// dep shim so these helpers stay loosely coupled to the rest of
// the shell.

function useTerminalPresetState() {
  const [config, setConfig] = useState(() => settingsDep("loadConfig")());
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [draft, setDraft] = useState(settingsDep("blankTerminalPresetDraft"));
  const [status, setStatus] = useState({ message: "", isError: false });
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  useEffect(() => {
    const syncConfig = () => setConfig(settingsDep("loadConfig")());
    window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), syncConfig);
    return () =>
      window.removeEventListener(
        settingsDep("WORKSPACE_CHANGED_EVENT"),
        syncConfig,
      );
  }, []);
  const updateDraft = (field, value) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const resetDraft = () => {
    setEditingProfileId(null);
    setDraft(settingsDep("blankTerminalPresetDraft")());
  };
  const editProfile = (profile) => {
    setEditingProfileId(profile.id);
    setDraft({
      name: profile.name,
      icon: profile.icon,
      program: profile.program,
      args: profile.args,
      type: profile.type,
      wd: profile.wd,
      env: profile.env,
    });
    setStatus({ message: `Editing ${profile.name}.`, isError: false });
  };
  return {
    config,
    setConfig,
    editingProfileId,
    draft,
    status,
    setStatus,
    draggedId,
    setDraggedId,
    dropTarget,
    setDropTarget,
    updateDraft,
    resetDraft,
    editProfile,
  };
}

function useTerminalPresetOrder(
  { config, profiles, draggedId, setDraggedId, setDropTarget },
) {
  const saveOrder = (nextOrder) => {
    settingsDep("saveTerminalProfiles")(
      config.terminalProfiles,
      config.defaultTerminalProfileId,
      nextOrder,
    );
  };
  const move = (profileId, direction) => {
    const nextOrder = profiles.map((profile) => profile.id);
    const index = nextOrder.indexOf(profileId);
    const target = index + direction;
    if (target < 0 || target >= nextOrder.length) return;
    [nextOrder[index], nextOrder[target]] = [
      nextOrder[target],
      nextOrder[index],
    ];
    saveOrder(nextOrder);
  };
  const drop = (targetId, placeAfter) => {
    if (!draggedId || draggedId === targetId) return;
    const nextOrder = profiles.map((profile) => profile.id).filter((id) =>
      id !== draggedId
    );
    const targetIndex = nextOrder.indexOf(targetId);
    nextOrder.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
    saveOrder(nextOrder);
    setDraggedId(null);
    setDropTarget(null);
  };
  return { saveOrder, move, drop };
}

function useTerminalPresetSave(
  { config, profiles, editingProfileId, draft, setStatus, resetDraft },
) {
  const validateDraft = () => {
    const profile = settingsDep("normalizeTerminalProfile")({
      ...draft,
      id: editingProfileId || undefined,
    });
    if (!profile.program) throw new Error("A program is required.");
    if (
      profiles.some((item) =>
        item.id !== editingProfileId &&
        item.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase()
      )
    ) {
      throw new Error("A terminal preset with this name already exists.");
    }
    return profile;
  };
  const buildNextProfiles = (profile) => {
    const existing = config.terminalProfiles.some((item) =>
      item.id === editingProfileId
    );
    return editingProfileId && existing
      ? config.terminalProfiles.map((item) =>
        item.id === editingProfileId ? profile : item
      )
      : [...config.terminalProfiles, profile];
  };
  const saveDraft = () => {
    try {
      const profile = validateDraft();
      const nextProfiles = buildNextProfiles(profile);
      const nextOrder = settingsDep("normalizeTerminalProfileOrder")(
        config.terminalProfileOrder,
        nextProfiles,
      );
      settingsDep("saveTerminalProfiles")(
        nextProfiles,
        config.defaultTerminalProfileId,
        nextOrder,
      );
      setStatus({
        message: `${editingProfileId ? "Updated" : "Added"} ${profile.name}.`,
        isError: false,
      });
      resetDraft();
    } catch (error) {
      setStatus({
        message: error.message || "Unable to save the terminal preset.",
        isError: true,
      });
    }
  };
  const removeProfile = (profile) => {
    const nextProfiles = config.terminalProfiles.filter((item) =>
      item.id !== profile.id
    );
    const nextOrder = config.terminalProfileOrder.filter((id) =>
      id !== profile.id
    );
    settingsDep("saveTerminalProfiles")(
      nextProfiles,
      config.defaultTerminalProfileId === profile.id
        ? "bash"
        : config.defaultTerminalProfileId,
      nextOrder,
    );
    if (editingProfileId === profile.id) resetDraft();
    setStatus({ message: `Removed ${profile.name}.`, isError: false });
  };
  return { saveDraft, removeProfile };
}

function TerminalProfileActions(props) {
  const {
    profile,
    index,
    count,
    isDefault,
    onSetDefault,
    onEdit,
    onMove,
    onRemove,
  } = props;
  return React.createElement(
    "div",
    { className: "terminal-profile-actions" },
    React.createElement("button", {
      type: "button",
      className: isDefault ? "is-default" : "",
      title: isDefault
        ? `${profile.name} is the default`
        : `Make ${profile.name} the default`,
      "aria-label": isDefault
        ? `${profile.name} is the default`
        : `Make ${profile.name} the default`,
      disabled: isDefault,
      onClick: onSetDefault,
    }, React.createElement(Check, { size: 15, "aria-hidden": true })),
    React.createElement("button", {
      type: "button",
      title: `Edit ${profile.name}`,
      "aria-label": `Edit ${profile.name}`,
      onClick: onEdit,
    }, React.createElement(Pencil, { size: 15, "aria-hidden": true })),
    React.createElement("button", {
      type: "button",
      title: `Move ${profile.name} up`,
      "aria-label": `Move ${profile.name} up`,
      disabled: index === 0,
      onClick: () => onMove(-1),
    }, React.createElement(ArrowUp, { size: 15, "aria-hidden": true })),
    React.createElement("button", {
      type: "button",
      title: `Move ${profile.name} down`,
      "aria-label": `Move ${profile.name} down`,
      disabled: index === count - 1,
      onClick: () => onMove(1),
    }, React.createElement(ArrowDown, { size: 15, "aria-hidden": true })),
    !profile.builtin && React.createElement("button", {
      type: "button",
      title: `Remove ${profile.name}`,
      "aria-label": `Remove ${profile.name}`,
      onClick: onRemove,
    }, React.createElement(Trash2, { size: 15, "aria-hidden": true })),
  );
}

function TerminalProfileItem(props) {
  const {
    profile,
    index,
    count,
    isDefault,
    draggedId,
    dropTarget,
    onSetDefault,
    onEdit,
    onMove,
    onRemove,
    onDrop,
    setDraggedId,
    setDropTarget,
  } = props;
  const Icon = settingsDep("getTerminalPresetIcon")(profile);
  const isDropTarget = dropTarget?.id === profile.id;
  return React.createElement(
    "div",
    {
      key: profile.id,
      className: [
        "terminal-profile-item",
        draggedId === profile.id && "dragging",
        isDropTarget && (dropTarget.after ? "drop-after" : "drop-before"),
      ].filter(Boolean).join(" "),
      draggable: true,
      onDragStart: (event) => {
        setDraggedId(profile.id);
        event.dataTransfer?.setData("text/plain", profile.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        setDraggedId(null);
        setDropTarget(null);
      },
      onDragOver: (event) => {
        if (!draggedId || draggedId === profile.id) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setDropTarget({
          id: profile.id,
          after: event.clientY > bounds.top + bounds.height / 2,
        });
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      },
      onDrop: (event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onDrop(profile.id, event.clientY > bounds.top + bounds.height / 2);
      },
    },
    React.createElement(GripVertical, {
      className: "terminal-profile-handle",
      size: 16,
      "aria-hidden": true,
    }),
    React.createElement(Icon, {
      className: "terminal-profile-icon",
      size: 17,
      "aria-hidden": true,
    }),
    React.createElement(
      "div",
      { className: "terminal-profile-details" },
      React.createElement(
        "span",
        { className: "terminal-profile-name" },
        profile.name,
        profile.builtin &&
          React.createElement("span", {
            className: "terminal-profile-builtin-tag",
            title: "Built-in preset",
          }, "built-in"),
      ),
      React.createElement(
        "span",
        { className: "terminal-profile-meta" },
        `${settingsDep("terminalCommand")(profile)} · ${profile.type}${
          profile.id === "bash" ? " · shell defaults" : ""
        }`,
      ),
    ),
    React.createElement(TerminalProfileActions, {
      profile,
      index,
      count,
      isDefault,
      onSetDefault,
      onEdit,
      onMove,
      onRemove,
    }),
  );
}

function TerminalProfileBasicFields({ draft, updateDraft }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-name" },
      "Name",
    ),
    React.createElement("input", {
      id: "terminal-profile-name",
      value: draft.name,
      placeholder: "My tool",
      onChange: (event) => updateDraft("name", event.target.value),
    }),
    React.createElement(
      "div",
      { className: "terminal-profile-icon-label" },
      "Icon",
    ),
    React.createElement(settingsDep("TerminalPresetIconPicker"), {
      value: draft.icon,
      onChange: (icon) => updateDraft("icon", icon),
    }),
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-program" },
      "Program",
    ),
    React.createElement("input", {
      id: "terminal-profile-program",
      value: draft.program,
      placeholder: "crush",
      spellCheck: false,
      onChange: (event) => updateDraft("program", event.target.value),
    }),
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-args" },
      "Startup arguments",
    ),
    React.createElement("input", {
      id: "terminal-profile-args",
      value: draft.args,
      placeholder: "--help",
      spellCheck: false,
      onChange: (event) => updateDraft("args", event.target.value),
    }),
  );
}

function TerminalProfileRuntimeFields({ draft, updateDraft }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-type" },
      "Runtime",
    ),
    React.createElement(
      "select",
      {
        id: "terminal-profile-type",
        value: draft.type,
        onChange: (event) => updateDraft("type", event.target.value),
      },
      React.createElement("option", { value: "gojs" }, "Go + JavaScript"),
      React.createElement("option", { value: "wasi" }, "WASI"),
      React.createElement("option", { value: "js" }, "JavaScript"),
      React.createElement("option", { value: "auto" }, "Auto"),
    ),
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-wd" },
      "Working directory",
    ),
    React.createElement("input", {
      id: "terminal-profile-wd",
      value: draft.wd,
      placeholder: ".",
      onChange: (event) => updateDraft("wd", event.target.value),
    }),
    React.createElement(
      "label",
      { htmlFor: "terminal-profile-env" },
      "Environment variables",
    ),
    React.createElement("textarea", {
      id: "terminal-profile-env",
      value: draft.env,
      placeholder: "KEY=value",
      spellCheck: false,
      onChange: (event) => updateDraft("env", event.target.value),
    }),
  );
}

export function TerminalPresetEditor() {
  const editor = useTerminalPresetState();
  const profiles = settingsDep("getTerminalProfiles")(editor.config);
  const order = useTerminalPresetOrder({
    config: editor.config,
    profiles,
    draggedId: editor.draggedId,
    setDraggedId: editor.setDraggedId,
    setDropTarget: editor.setDropTarget,
  });
  const save = useTerminalPresetSave({
    config: editor.config,
    profiles,
    editingProfileId: editor.editingProfileId,
    draft: editor.draft,
    setStatus: editor.setStatus,
    resetDraft: editor.resetDraft,
  });
  const setDefault = (profile) => {
    settingsDep("saveTerminalProfiles")(
      editor.config.terminalProfiles,
      profile.id,
      editor.config.terminalProfileOrder,
    );
    editor.setStatus({
      message: `${profile.name} is now the default terminal.`,
      isError: false,
    });
  };
  const renderItem = (profile, index) =>
    React.createElement(TerminalProfileItem, {
      key: profile.id,
      profile,
      index,
      count: profiles.length,
      isDefault: editor.config.defaultTerminalProfileId === profile.id,
      draggedId: editor.draggedId,
      dropTarget: editor.dropTarget,
      onSetDefault: () => setDefault(profile),
      onEdit: () => editor.editProfile(profile),
      onMove: (direction) => order.move(profile.id, direction),
      onRemove: () => save.removeProfile(profile),
      onDrop: order.drop,
      setDraggedId: editor.setDraggedId,
      setDropTarget: editor.setDropTarget,
    });

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "p",
      { className: "hint" },
      "Drag presets to reorder Terminal menus. Choose an icon from the GearShell Lucide set, then add a command with its startup arguments.",
    ),
    React.createElement("div", {
      className: "terminal-profile-list",
      "aria-label": "Terminal preset order",
    }, profiles.map(renderItem)),
    React.createElement(
      "div",
      { className: "terminal-profile-fields" },
      React.createElement(TerminalProfileBasicFields, {
        draft: editor.draft,
        updateDraft: editor.updateDraft,
      }),
      React.createElement(TerminalProfileRuntimeFields, {
        draft: editor.draft,
        updateDraft: editor.updateDraft,
      }),
    ),
    React.createElement(
      "div",
      { className: "workspace-actions" },
      React.createElement(
        "button",
        { type: "button", onClick: save.saveDraft },
        editor.editingProfileId
          ? "Save terminal preset"
          : "Add terminal preset",
      ),
      editor.editingProfileId && React.createElement("button", {
        type: "button",
        onClick: () => {
          editor.resetDraft();
          editor.setStatus({ message: "Edit cancelled.", isError: false });
        },
      }, "Cancel edit"),
    ),
    React.createElement("div", {
      className: "hint terminal-profile-status",
      role: "status",
      "aria-live": "polite",
      "data-error": editor.status.isError || undefined,
    }, editor.status.message),
  );
}

export function setupTerminalProfileForm(settingsContent) {
  const editor = settingsContent.querySelector(
    "[data-terminal-profile-editor]",
  );
  if (!editor) return undefined;
  const root = createRoot(editor);
  root.render(React.createElement(TerminalPresetEditor));
  return () => root.unmount();
}
