// Crush configuration tab bodies: the Profile / crushrc / Env / JSON
// editors rendered under the tab bar (split out of
// crush-panel-config.js so no component exceeds 50 lines and no file
// exceeds the 500-line budget). Each tab only reads the `ctl` object
// the panel controller returns.

import React from "react";
import { RefreshCw, Save } from "lucide-react";
import { crushRunnerDep } from "./crush-deps.js?v=20260828.4";
import { crushRunDirFor } from "./crush-config.js?v=20260826.3";
import htm from "htm";

const html = htm.bind(React.createElement);

export function TabResetButton({ onClick, disabled, title }) {
  return html`
    <button
      className="mkt-btn mkt-btn-ghost"
      type="button"
      onClick=${onClick}
      disabled=${disabled}
      title=${title}
    >
      <${RefreshCw} size=${14} aria-hidden=${true}/>
      <span>Reset</span>
    </button>
  `;
}

function ProfileTextField({ id, value, placeholder, spellCheck, onChange }) {
  return html`<input
    id=${id}
    type="text"
    value=${value}
    spellCheck=${spellCheck}
    placeholder=${placeholder}
    onChange=${onChange}
  />`;
}

function crushProfileTextFieldDefs(ctl) {
  const { draft, updateField, programAutoManagedRef } = ctl;
  return [
    {
      id: "crush-runner-name",
      label: "Preset name",
      value: draft.name,
      placeholder: "Crush",
      onChange: (event) => updateField("name", event.target.value),
    },
    {
      id: "crush-runner-program",
      label: "Program",
      value: draft.program,
      placeholder: "crush",
      onChange: (event) => {
        // Once the user starts editing the program field we leave it
        // alone; detection results will no longer overwrite it.
        programAutoManagedRef.current = false;
        updateField("program", event.target.value);
      },
    },
    {
      id: "crush-runner-args",
      label: "Startup arguments",
      value: draft.args,
      placeholder: "--help",
      onChange: (event) => updateField("args", event.target.value),
    },
  ];
}

function CrushProfileIconField({ ctl }) {
  return html`
    <${React.Fragment}>
      <label className="crush-runner-icon-label" htmlFor="crush-runner-icon">Icon</label>
      <${crushRunnerDep("TerminalPresetIconPicker")}
        id="crush-runner-icon"
        value=${ctl.draft.icon}
        onChange=${(icon) => ctl.updateField("icon", icon)}
      />
    </${React.Fragment}>
  `;
}

function CrushProfileRuntimeField({ ctl }) {
  return html`
    <${React.Fragment}>
      <label htmlFor="crush-runner-type">Runtime</label>
      <select
        id="crush-runner-type"
        value=${ctl.draft.type}
        onChange=${(event) => ctl.updateField("type", event.target.value)}
      >
        <option value="auto">Auto</option>
        <option value="gojs">Go + JavaScript</option>
        <option value="wasi">WASI</option>
        <option value="js">JavaScript</option>
      </select>
    </${React.Fragment}>
  `;
}

function CrushProfileFields({ ctl }) {
  const textFields = crushProfileTextFieldDefs(ctl);
  return html`
    <div className="crush-runner-fields">
      <${CrushProfileIconField} ctl=${ctl}/>
      ${textFields.map((field) =>
        html`
          <${React.Fragment} key=${field.id}>
            <label htmlFor=${field.id}>${field.label}</label>
            <${ProfileTextField}
              id=${field.id}
              value=${field.value}
              placeholder=${field.placeholder}
              spellCheck=${false}
              onChange=${field.onChange}
            />
          </${React.Fragment}>
        `,
      )}
      <${CrushProfileRuntimeField} ctl=${ctl}/>
      <label htmlFor="crush-runner-wd">Working directory</label>
      <input
        id="crush-runner-wd"
        type="text"
        value=${ctl.draft.wd}
        spellCheck=${false}
        placeholder="."
        onChange=${(event) => ctl.updateField("wd", event.target.value)}
      />
    </div>
  `;
}

export function CrushProfileTab({ ctl }) {
  const { profileDirty, resetProfileFields } = ctl;
  return html`
    <div
      className="crush-runner-section-body crush-runner-tab-panel"
      data-dirty=${profileDirty || undefined}
    >
      <${CrushProfileFields} ctl=${ctl}/>
      <div className="crush-runner-section-actions">
        <${TabResetButton}
          onClick=${resetProfileFields}
          disabled=${!profileDirty}
          title="Restore profile fields to the saved preset"
        />
      </div>
    </div>
  `;
}

export function CrushCrushrcTab({ ctl }) {
  const {
    configDirty,
    crushrcContent,
    setCrushrcContent,
    resetCrushrcField,
    params,
  } = ctl;
  return html`
    <div
      className="crush-runner-section-body crush-runner-tab-panel"
      data-dirty=${configDirty || undefined}
    >
      <p className="hint">
        Mounted inline at <code>/${crushRunDirFor(params?.runnerId)}/crushrc</code> inside the task via per-task <code><wanix-bind></code> entries (a fresh ramfs at the fixed mount point plus the user's rcfile; each task gets its own copy-on-write namespace), so every CrushRunner instance has its own providers, models, and UI options without touching any shared filesystem state.
      </p>
      <textarea
        id="crush-runner-crushrc"
        className="crush-runner-env crush-runner-crushrc"
        value=${crushrcContent}
        spellCheck=${false}
        aria-label="crushrc contents"
        placeholder="AGW=..."
        onChange=${(event) => setCrushrcContent(event.target.value)}
      ></textarea>
      <div className="crush-runner-section-actions">
        <${TabResetButton}
          onClick=${resetCrushrcField}
          disabled=${!configDirty}
          title="Restore the built-in crushrc template"
        />
      </div>
    </div>
  `;
}

function CrushEnvMergedResult({ envLines }) {
  return html`
    <p className="hint">
      <span
        className="crush-runner-env-override-count"
        data-empty=${envLines.length === 0 ? "true" : "false"}
      >${envLines.length === 0
        ? "Inherits built-ins"
        : `${envLines.length} override${envLines.length === 1 ? "" : "s"}`}</span>
      Merged result: <code>${envLines.length === 0 ? "(no overrides)" : envLines.join(" · ")}</code>
    </p>
  `;
}

export function CrushEnvTab({ ctl }) {
  const { draft, updateField, envLines, envDirty, resetEnvField } = ctl;
  return html`
    <div className="crush-runner-section-body crush-runner-tab-panel">
      <p className="hint crush-runner-hint">
        Crush inherits the GearShell shell defaults (<code>${crushRunnerDep("WANIX")}</code>, <code>${crushRunnerDep("HOME")}</code>, PATH, CRUSH_*, etc.). Add lines below to override or extend them in KEY=value format.
      </p>
      <textarea
        id="crush-runner-env"
        className="crush-runner-env"
        value=${draft.env}
        spellCheck=${false}
        placeholder=${"CRUSH_LOG=info\nOPENAI_API_KEY=..."}
        onChange=${(event) => updateField("env", event.target.value)}
      ></textarea>
      <${CrushEnvMergedResult} envLines=${envLines}/>
      <div className="crush-runner-section-actions">
        <${TabResetButton}
          onClick=${resetEnvField}
          disabled=${!envDirty}
          title="Restore env overrides to the saved preset"
        />
      </div>
    </div>
  `;
}

export function CrushJsonTab({ ctl }) {
  const { jsonDraft, jsonDraftDirty, applyJsonEdit } = ctl;
  return html`
    <div
      className="crush-runner-section-body crush-runner-tab-panel"
      data-dirty=${jsonDraftDirty || undefined}
    >
      <p className="hint">Full preset snapshot (profile + crushrc), pretty-printed with 2-space indent. Edits sync into the other tabs; press the Reset to discard them.</p>
      <textarea
        id="crush-runner-json"
        className="crush-runner-env crush-runner-crushrc crush-runner-json"
        value=${jsonDraft}
        spellCheck=${false}
        aria-label="preset JSON contents"
        placeholder=${'{ "name": "Crush", ... }'}
        onChange=${(event) => applyJsonEdit(event.target.value)}
      ></textarea>
      <${CrushJsonActions} ctl=${ctl}/>
    </div>
  `;
}

function CrushJsonActions({ ctl }) {
  return html`
    <div className="crush-runner-section-actions">
      <${TabResetButton}
        onClick=${ctl.resetJsonDraft}
        disabled=${!ctl.jsonDraftDirty}
        title="Discard JSON edits and revert to the current form state"
      />
      <button
        className="mkt-btn mkt-btn-ghost"
        type="button"
        onClick=${ctl.copyProfileJson}
        title="Copy the current profile + crushrc to the clipboard for debugging or sharing"
      >
        <${Save} size=${14} aria-hidden=${true}/>
        <span>Copy</span>
      </button>
    </div>
  `;
}
