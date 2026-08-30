// Terminal preset form components: the row item with drag reorder,
// its action buttons, and the basic/runtime field groups (split out
// of settings-terminal-editor.js so no file exceeds the 500-line
// budget and no component exceeds 50 lines).

import React from "react";
import htm from "htm";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { settingsDep } from "./settings-deps.js?v=20260826.3";

const html = htm.bind(React.createElement);
const Fragment = React.Fragment;

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
  return html`
    <div className="terminal-profile-actions">
      ${profileActionButtons(props).map((b) =>
        html`<button
          key=${b.key}
          type="button"
          className=${b.cls}
          title=${b.title}
          aria-label=${b.title}
          disabled=${b.disabled}
          onClick=${b.onClick}
        ><${b.icon} size=${15} aria-hidden=${true}/></button>`,
      )}
    </div>
  `;
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
  return html`
    <div className="terminal-profile-details">
      <span className="terminal-profile-name">
        ${profile.name}
        ${profile.builtin
          ? html`<span className="terminal-profile-builtin-tag" title="Built-in preset">built-in</span>`
          : null}
      </span>
      <span className="terminal-profile-meta">
        ${settingsDep("terminalCommand")(profile)} · ${profile.type}${profile.id === "bash" ? " · shell defaults" : ""}
      </span>
    </div>
  `;
}

function ProfileItemGlyph({ draggedId, dropTarget, Icon }) {
  return html`
    <${Fragment}>
      <${GripVertical} className="terminal-profile-handle" size=${16} aria-hidden=${true}/>
      <${Icon} className="terminal-profile-icon" size=${17} aria-hidden=${true}/>
    </${Fragment}>
  `;
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
  return html`
    <div
      key=${profile.id}
      className=${profileItemClassName(profile, draggedId, dropTarget)}
      draggable=${true}
      ...${profileItemDragHandlers({
        profile,
        draggedId,
        setDraggedId,
        setDropTarget,
        onDrop,
      })}
    >
      <${ProfileItemGlyph} draggedId=${draggedId} dropTarget=${dropTarget} Icon=${Icon}/>
      <${ProfileItemDetails} profile=${profile}/>
      <${TerminalProfileActions} profile=${profile} index=${index} count=${count} isDefault=${isDefault} onSetDefault=${onSetDefault} onEdit=${onEdit} onMove=${onMove} onRemove=${onRemove}/>
    </div>
  `;
}

export function TerminalProfileBasicFields({ draft, updateDraft }) {
  const textFields = [
    ["terminal-profile-name", "Name", "My tool", "name", false],
    ["terminal-profile-program", "Program", "crush", "program", true],
    ["terminal-profile-args", "Startup arguments", "--help", "args", true],
  ];
  const [nameField, ...restFields] = textFields;
  const renderField = ([id, label, placeholder, key, spellCheck]) =>
    html`
      <${Fragment}>
        <label htmlFor=${id}>${label}</label>
        <input
          id=${id}
          value=${draft[key]}
          placeholder=${placeholder}
          spellCheck=${spellCheck}
          onChange=${(event) => updateDraft(key, event.target.value)}
        />
      </${Fragment}>
    `;
  return html`
    <${Fragment}>
      ${renderField(nameField)}
      <div className="terminal-profile-icon-label">Icon</div>
      <${settingsDep("TerminalPresetIconPicker")} value=${draft.icon} onChange=${(icon) => updateDraft("icon", icon)}/>
      ${restFields.map(renderField)}
    </${Fragment}>
  `;
}

export function TerminalProfileRuntimeFields({ draft, updateDraft }) {
  return html`
    <${Fragment}>
      <label htmlFor="terminal-profile-type">Runtime</label>
      <select
        id="terminal-profile-type"
        value=${draft.type}
        onChange=${(event) => updateDraft("type", event.target.value)}
      >
        <option value="gojs">Go + JavaScript</option>
        <option value="wasi">WASI</option>
        <option value="js">JavaScript</option>
        <option value="auto">Auto</option>
      </select>
      <label htmlFor="terminal-profile-wd">Working directory</label>
      <input
        id="terminal-profile-wd"
        value=${draft.wd}
        placeholder="."
        onChange=${(event) => updateDraft("wd", event.target.value)}
      />
      <label htmlFor="terminal-profile-env">Environment variables</label>
      <textarea
        id="terminal-profile-env"
        value=${draft.env}
        placeholder="KEY=value"
        spellCheck=${false}
        onChange=${(event) => updateDraft("env", event.target.value)}
      ></textarea>
    </${Fragment}>
  `;
}
