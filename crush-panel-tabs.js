// Crush configuration tab bodies: the Profile / crushrc / Env / JSON
// editors rendered under the tab bar (split out of
// crush-panel-config.js so no component exceeds 50 lines and no file
// exceeds the 500-line budget). Each tab only reads the `ctl` object
// the panel controller returns.

import React from "react";
import { RefreshCw, Save } from "lucide-react";
import { crushRunnerDep } from "./crush-deps.js?v=20260826.2";
import { crushRunDirFor } from "./crush-config.js?v=20260826.2";

export function TabResetButton({ onClick, disabled, title }) {
  return React.createElement(
    "button",
    {
      className: "mkt-btn mkt-btn-ghost",
      type: "button",
      onClick,
      disabled,
      title,
    },
    React.createElement(RefreshCw, { size: 14, "aria-hidden": true }),
    React.createElement("span", null, "Reset"),
  );
}

function ProfileTextField({ id, value, placeholder, spellCheck, onChange }) {
  return React.createElement("input", {
    id,
    type: "text",
    value,
    spellCheck,
    placeholder,
    onChange,
  });
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
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "label",
      { className: "crush-runner-icon-label", htmlFor: "crush-runner-icon" },
      "Icon",
    ),
    React.createElement(crushRunnerDep("TerminalPresetIconPicker"), {
      id: "crush-runner-icon",
      value: ctl.draft.icon,
      onChange: (icon) => ctl.updateField("icon", icon),
    }),
  );
}

function CrushProfileRuntimeField({ ctl }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("label", {
      htmlFor: "crush-runner-type",
    }, "Runtime"),
    React.createElement(
      "select",
      {
        id: "crush-runner-type",
        value: ctl.draft.type,
        onChange: (event) => ctl.updateField("type", event.target.value),
      },
      React.createElement("option", { value: "auto" }, "Auto"),
      React.createElement("option", { value: "gojs" }, "Go + JavaScript"),
      React.createElement("option", { value: "wasi" }, "WASI"),
      React.createElement("option", { value: "js" }, "JavaScript"),
    ),
  );
}

function CrushProfileFields({ ctl }) {
  const textFields = crushProfileTextFieldDefs(ctl);
  return React.createElement(
    "div",
    { className: "crush-runner-fields" },
    React.createElement(CrushProfileIconField, { ctl }),
    ...textFields.map((field) =>
      React.createElement(
        React.Fragment,
        { key: field.id },
        React.createElement("label", { htmlFor: field.id }, field.label),
        React.createElement(ProfileTextField, {
          id: field.id,
          value: field.value,
          placeholder: field.placeholder,
          spellCheck: false,
          onChange: field.onChange,
        }),
      )
    ),
    React.createElement(CrushProfileRuntimeField, { ctl }),
    React.createElement("label", {
      htmlFor: "crush-runner-wd",
    }, "Working directory"),
    React.createElement("input", {
      id: "crush-runner-wd",
      type: "text",
      value: ctl.draft.wd,
      spellCheck: false,
      placeholder: ".",
      onChange: (event) => ctl.updateField("wd", event.target.value),
    }),
  );
}

export function CrushProfileTab({ ctl }) {
  const { profileDirty, resetProfileFields } = ctl;
  return React.createElement(
    "div",
    {
      className: "crush-runner-section-body crush-runner-tab-panel",
      "data-dirty": profileDirty || undefined,
    },
    React.createElement(CrushProfileFields, { ctl }),
    React.createElement(
      "div",
      { className: "crush-runner-section-actions" },
      React.createElement(TabResetButton, {
        onClick: resetProfileFields,
        disabled: !profileDirty,
        title: "Restore profile fields to the saved preset",
      }),
    ),
  );
}

export function CrushCrushrcTab({ ctl }) {
  const {
    configDirty,
    crushrcContent,
    setCrushrcContent,
    resetCrushrcField,
    params,
  } = ctl;
  return React.createElement(
    "div",
    {
      className: "crush-runner-section-body crush-runner-tab-panel",
      "data-dirty": configDirty || undefined,
    },
    React.createElement(
      "p",
      { className: "hint" },
      "Mounted inline at ",
      React.createElement(
        "code",
        null,
        `/${crushRunDirFor(params?.runnerId)}/crushrc`,
      ),
      " inside the task via per-task ",
      React.createElement("code", null, "<wanix-bind>"),
      " entries (a fresh ramfs at the fixed mount point plus the user's rcfile; each task gets its own copy-on-write namespace), so every CrushRunner instance has its own providers, models, and UI options without touching any shared filesystem state.",
    ),
    React.createElement("textarea", {
      id: "crush-runner-crushrc",
      className: "crush-runner-env crush-runner-crushrc",
      value: crushrcContent,
      spellCheck: false,
      "aria-label": "crushrc contents",
      placeholder: "AGW=...",
      onChange: (event) => setCrushrcContent(event.target.value),
    }),
    React.createElement(
      "div",
      { className: "crush-runner-section-actions" },
      React.createElement(TabResetButton, {
        onClick: resetCrushrcField,
        disabled: !configDirty,
        title: "Restore the built-in crushrc template",
      }),
    ),
  );
}

function CrushEnvMergedResult({ envLines }) {
  return React.createElement(
    "p",
    { className: "hint" },
    React.createElement(
      "span",
      {
        className: "crush-runner-env-override-count",
        "data-empty": envLines.length === 0 ? "true" : "false",
      },
      envLines.length === 0
        ? "Inherits built-ins"
        : `${envLines.length} override${envLines.length === 1 ? "" : "s"}`,
    ),
    "Merged result: ",
    React.createElement(
      "code",
      null,
      `${envLines.length === 0 ? "(no overrides)" : envLines.join(" · ")}`,
    ),
  );
}

export function CrushEnvTab({ ctl }) {
  const { draft, updateField, envLines, envDirty, resetEnvField } = ctl;
  return React.createElement(
    "div",
    { className: "crush-runner-section-body crush-runner-tab-panel" },
    React.createElement(
      "p",
      { className: "hint crush-runner-hint" },
      "Crush inherits the GearShell shell defaults (",
      React.createElement("code", null, crushRunnerDep("WANIX")),
      ", ",
      React.createElement("code", null, crushRunnerDep("HOME")),
      ", PATH, CRUSH_*, etc.). Add lines below to override or extend them in KEY=value format.",
    ),
    React.createElement("textarea", {
      id: "crush-runner-env",
      className: "crush-runner-env",
      value: draft.env,
      spellCheck: false,
      placeholder: "CRUSH_LOG=info\nOPENAI_API_KEY=...",
      onChange: (event) => updateField("env", event.target.value),
    }),
    React.createElement(CrushEnvMergedResult, { envLines }),
    React.createElement(
      "div",
      { className: "crush-runner-section-actions" },
      React.createElement(TabResetButton, {
        onClick: resetEnvField,
        disabled: !envDirty,
        title: "Restore env overrides to the saved preset",
      }),
    ),
  );
}

export function CrushJsonTab({ ctl }) {
  const { jsonDraft, jsonDraftDirty, applyJsonEdit } = ctl;
  return React.createElement(
    "div",
    {
      className: "crush-runner-section-body crush-runner-tab-panel",
      "data-dirty": jsonDraftDirty || undefined,
    },
    React.createElement(
      "p",
      { className: "hint" },
      "Full preset snapshot (profile + crushrc), pretty-printed with 2-space indent. Edits sync into the other tabs; press the Reset to discard them.",
    ),
    React.createElement("textarea", {
      id: "crush-runner-json",
      className: "crush-runner-env crush-runner-crushrc crush-runner-json",
      value: jsonDraft,
      spellCheck: false,
      "aria-label": "preset JSON contents",
      placeholder: '{ "name": "Crush", ... }',
      onChange: (event) => applyJsonEdit(event.target.value),
    }),
    React.createElement(CrushJsonActions, { ctl }),
  );
}

function CrushJsonActions({ ctl }) {
  return React.createElement(
    "div",
    { className: "crush-runner-section-actions" },
    React.createElement(TabResetButton, {
      onClick: ctl.resetJsonDraft,
      disabled: !ctl.jsonDraftDirty,
      title: "Discard JSON edits and revert to the current form state",
    }),
    React.createElement(
      "button",
      {
        className: "mkt-btn mkt-btn-ghost",
        type: "button",
        onClick: ctl.copyProfileJson,
        title:
          "Copy the current profile + crushrc to the clipboard for debugging or sharing",
      },
      React.createElement(Save, { size: 14, "aria-hidden": true }),
      React.createElement("span", null, "Copy"),
    ),
  );
}
