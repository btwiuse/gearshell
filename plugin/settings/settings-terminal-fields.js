// Terminal preset form components: the row item with drag reorder,
// its action buttons, and the basic/runtime field groups (split out
// of settings-terminal-editor.js so no file exceeds the 500-line
// budget and no component exceeds 50 lines).

import React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { settingsDep } from "./settings-deps.js?v=20260826.3";

function profileActionButtons(props) {
  const { profile, index, count, isDefault } = props;
  const acts = [
    {
      key: "default",
      title: isDefault
        ? `${profile.name} is the default`
        : `Make ${profile.name} the default`,
      cls: isDefault ? "is-default" : "",
      icon: Check,
      disabled: isDefault,
      onClick: props.onSetDefault,
    },
    {
      key: "edit",
      title: `Edit ${profile.name}`,
      icon: Pencil,
      onClick: props.onEdit,
    },
    {
      key: "up",
      title: `Move ${profile.name} up`,
      icon: ArrowUp,
      disabled: index === 0,
      onClick: () => props.onMove(-1),
    },
    {
      key: "down",
      title: `Move ${profile.name} down`,
      icon: ArrowDown,
      disabled: index === count - 1,
      onClick: () => props.onMove(1),
    },
  ];
  if (!profile.builtin) {
    acts.push({
      key: "remove",
      title: `Remove ${profile.name}`,
      icon: Trash2,
      onClick: props.onRemove,
    });
  }
  return acts;
}

export function TerminalProfileActions(props) {
  return React.createElement(
    "div",
    { className: "terminal-profile-actions" },
    ...profileActionButtons(props).map((b) =>
      React.createElement("button", {
        key: b.key,
        type: "button",
        className: b.cls,
        title: b.title,
        "aria-label": b.title,
        disabled: b.disabled,
        onClick: b.onClick,
      }, React.createElement(b.icon, { size: 15, "aria-hidden": true }))
    ),
  );
}

function profileItemDragHandlers({
  profile,
  draggedId,
  setDraggedId,
  setDropTarget,
  onDrop,
}) {
  return {
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
  };
}

function ProfileItemDetails({ profile }) {
  return React.createElement(
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
  );
}

function ProfileItemGlyph({ draggedId, dropTarget, Icon }) {
  return React.createElement(
    React.Fragment,
    null,
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
  );
}

function profileItemClassName(profile, draggedId, dropTarget) {
  const isDropTarget = dropTarget?.id === profile.id;
  return [
    "terminal-profile-item",
    draggedId === profile.id && "dragging",
    isDropTarget && (dropTarget.after ? "drop-after" : "drop-before"),
  ].filter(Boolean).join(" ");
}

export function TerminalProfileItem(props) {
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
  return React.createElement(
    "div",
    {
      key: profile.id,
      className: profileItemClassName(profile, draggedId, dropTarget),
      draggable: true,
      ...profileItemDragHandlers({
        profile,
        draggedId,
        setDraggedId,
        setDropTarget,
        onDrop,
      }),
    },
    React.createElement(ProfileItemGlyph, { draggedId, dropTarget, Icon }),
    React.createElement(ProfileItemDetails, { profile }),
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

export function TerminalProfileBasicFields({ draft, updateDraft }) {
  const textFields = [
    ["terminal-profile-name", "Name", "My tool", "name", false],
    ["terminal-profile-program", "Program", "crush", "program", true],
    ["terminal-profile-args", "Startup arguments", "--help", "args", true],
  ];
  const [nameField, ...restFields] = textFields;
  const renderField = ([id, label, placeholder, key, spellCheck]) =>
    React.createElement(
      React.Fragment,
      { key: id },
      React.createElement("label", { htmlFor: id }, label),
      React.createElement("input", {
        id,
        value: draft[key],
        placeholder,
        spellCheck,
        onChange: (event) => updateDraft(key, event.target.value),
      }),
    );
  return React.createElement(
    React.Fragment,
    null,
    renderField(nameField),
    React.createElement(
      "div",
      { className: "terminal-profile-icon-label" },
      "Icon",
    ),
    React.createElement(settingsDep("TerminalPresetIconPicker"), {
      value: draft.icon,
      onChange: (icon) => updateDraft("icon", icon),
    }),
    ...restFields.map(renderField),
  );
}

export function TerminalProfileRuntimeFields({ draft, updateDraft }) {
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
