// Terminal preset editor + profile form wiring.

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { settingsDep } from "./settings-deps.js?v=20260826.1";
// auto-start). `TerminalPresetEditor` is the React sub-component
// that manages the built-in terminal preset catalog (Terminal,
// Crush, custom entries) — list, drag-reorder, edit, add, remove.
// All app.js globals they touch (workspace / bind / task helpers,
// terminal profile loaders, the WORKSPACE_CHANGED_EVENT constant,
// the TerminalPresetIconPicker React component) are passed via the
// dep shim so these helpers stay loosely coupled to the rest of
// the shell.

export function TerminalPresetEditor() {
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

  const profiles = settingsDep("getTerminalProfiles")(config);
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
  const saveDraft = () => {
    try {
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
      const existing = config.terminalProfiles.some((item) =>
        item.id === editingProfileId
      );
      const nextProfiles = editingProfileId && existing
        ? config.terminalProfiles.map((item) =>
          item.id === editingProfileId ? profile : item
        )
        : [...config.terminalProfiles, profile];
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
        ? "hush"
        : config.defaultTerminalProfileId,
      nextOrder,
    );
    if (editingProfileId === profile.id) resetDraft();
    setStatus({ message: `Removed ${profile.name}.`, isError: false });
  };

  const renderProfile = (profile, index) => {
    const Icon = settingsDep("getTerminalPresetIcon")(profile);
    const isDefault = config.defaultTerminalProfileId === profile.id;
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
          drop(profile.id, event.clientY > bounds.top + bounds.height / 2);
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
            profile.id === "hush" ? " · shell defaults" : ""
          }`,
        ),
      ),
      React.createElement(
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
          onClick: () => {
            settingsDep("saveTerminalProfiles")(
              config.terminalProfiles,
              profile.id,
              config.terminalProfileOrder,
            );
            setStatus({
              message: `${profile.name} is now the default terminal.`,
              isError: false,
            });
          },
        }, React.createElement(Check, { size: 15, "aria-hidden": true })),
        React.createElement("button", {
          type: "button",
          title: `Edit ${profile.name}`,
          "aria-label": `Edit ${profile.name}`,
          onClick: () => editProfile(profile),
        }, React.createElement(Pencil, { size: 15, "aria-hidden": true })),
        React.createElement("button", {
          type: "button",
          title: `Move ${profile.name} up`,
          "aria-label": `Move ${profile.name} up`,
          disabled: index === 0,
          onClick: () => move(profile.id, -1),
        }, React.createElement(ArrowUp, { size: 15, "aria-hidden": true })),
        React.createElement("button", {
          type: "button",
          title: `Move ${profile.name} down`,
          "aria-label": `Move ${profile.name} down`,
          disabled: index === profiles.length - 1,
          onClick: () => move(profile.id, 1),
        }, React.createElement(ArrowDown, { size: 15, "aria-hidden": true })),
        !profile.builtin && React.createElement("button", {
          type: "button",
          title: `Remove ${profile.name}`,
          "aria-label": `Remove ${profile.name}`,
          onClick: () => removeProfile(profile),
        }, React.createElement(Trash2, { size: 15, "aria-hidden": true })),
      ),
    );
  };

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
    }, profiles.map(renderProfile)),
    React.createElement(
      "div",
      { className: "terminal-profile-fields" },
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
    ),
    React.createElement(
      "div",
      { className: "workspace-actions" },
      React.createElement(
        "button",
        { type: "button", onClick: saveDraft },
        editingProfileId ? "Save terminal preset" : "Add terminal preset",
      ),
      editingProfileId &&
        React.createElement("button", {
          type: "button",
          onClick: () => {
            resetDraft();
            setStatus({ message: "Edit cancelled.", isError: false });
          },
        }, "Cancel edit"),
    ),
    React.createElement("div", {
      className: "hint terminal-profile-status",
      role: "status",
      "aria-live": "polite",
      "data-error": status.isError || undefined,
    }, status.message),
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
