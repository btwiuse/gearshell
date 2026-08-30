// Terminal preset editor: the React sub-component that manages the
// built-in terminal preset catalog (list, drag-reorder, edit, add,
// remove) plus the settings-page form mount. State hooks live in
// settings-terminal-presets.js and the row/field components in
// settings-terminal-fields.js (500-line rule split).

import React from "react";
import { createRoot } from "react-dom/client";
import { settingsDep } from "./settings-deps.js?v=20260826.3";
import {
  useTerminalPresetOrder,
  useTerminalPresetSave,
  useTerminalPresetState,
} from "./settings-terminal-presets.js?v=20260828.3";
import {
  TerminalProfileBasicFields,
  TerminalProfileItem,
  TerminalProfileRuntimeFields,
} from "./settings-terminal-fields.js?v=20260828.3";
import htm from "htm";

const html = htm.bind(React.createElement);

function renderProfileItem(profile, index, ctx) {
  return html`<${TerminalProfileItem}
    key=${profile.id}
    profile=${profile}
    index=${index}
    count=${ctx.profiles.length}
    isDefault=${ctx.editor.config.defaultTerminalProfileId === profile.id}
    draggedId=${ctx.editor.draggedId}
    dropTarget=${ctx.editor.dropTarget}
    onSetDefault=${() => ctx.setDefault(profile)}
    onEdit=${() => ctx.editor.editProfile(profile)}
    onMove=${(direction) => ctx.order.move(profile.id, direction)}
    onRemove=${() => ctx.save.removeProfile(profile)}
    onDrop=${ctx.order.drop}
    setDraggedId=${ctx.editor.setDraggedId}
    setDropTarget=${ctx.editor.setDropTarget}
  />`;
}

function PresetEditorControls({ editor, save }) {
  return html`
    <${React.Fragment}>
      <div className="terminal-profile-fields">
        <${TerminalProfileBasicFields} draft=${editor.draft} updateDraft=${editor.updateDraft}/>
        <${TerminalProfileRuntimeFields} draft=${editor.draft} updateDraft=${editor.updateDraft}/>
      </div>
      <div className="workspace-actions">
        <button type="button" onClick=${save.saveDraft}>
          ${editor.editingProfileId
            ? "Save terminal preset"
            : "Add terminal preset"}
        </button>
        ${editor.editingProfileId && html`<button
          type="button"
          onClick=${() => {
            editor.resetDraft();
            editor.setStatus({ message: "Edit cancelled.", isError: false });
          }}
        >Cancel edit</button>`}
      </div>
      <div
        className="hint terminal-profile-status"
        role="status"
        aria-live="polite"
        data-error=${editor.status.isError || undefined}
      >${editor.status.message}</div>
    </${React.Fragment}>
  `;
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
  const ctx = { profiles, editor, order, save, setDefault };

  return html`
    <${React.Fragment}>
      <p className="hint">Drag presets to reorder Terminal menus. Choose an icon from the GearShell Lucide set, then add a command with its startup arguments.</p>
      <div
        className="terminal-profile-list"
        aria-label="Terminal preset order"
      >
        ${profiles.map((profile, index) => renderProfileItem(profile, index, ctx))}
      </div>
      <${PresetEditorControls} editor=${editor} save=${save}/>
    </${React.Fragment}>
  `;
}

export function setupTerminalProfileForm(settingsContent) {
  const editor = settingsContent.querySelector(
    "[data-terminal-profile-editor]",
  );
  if (!editor) return undefined;
  const root = createRoot(editor);
  root.render(html`<${TerminalPresetEditor}/>`);
  return () => root.unmount();
}
