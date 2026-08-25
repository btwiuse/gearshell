// The configuration section of the Crush Runner panel: a tab bar
// (Profile / crushrc / Env / JSON) over the matching editors. Extracted
// from the panel component so the JSX stays under the 500-line rule; it
// only ever reads the `ctl` object the panel controller returns.

import React from "react";
import {
  Braces,
  FileCode,
  KeyRound,
  RefreshCw,
  Save,
  User,
} from "lucide-react";

import { crushRunnerDep } from "./crush-deps.js?v=20260826.1";
import { crushRunDirFor } from "./crush-config.js?v=20260826.1";

export function CrushConfigSection({ ctl }) {
  const {
    formExpanded,
    crushInstalled,
    activeTab,
    setActiveTab,
    draft,
    updateField,
    profileDirty,
    configDirty,
    envDirty,
    resetProfileFields,
    resetCrushrcField,
    resetEnvField,
    resetJsonDraft,
    copyProfileJson,
    crushrcContent,
    setCrushrcContent,
    envLines,
    jsonDraft,
    jsonDraftDirty,
    applyJsonEdit,
    savedMarker,
    programAutoManagedRef,
    params,
  } = ctl;

  if (!(crushInstalled === true && formExpanded)) return null;

  const tabs = [
    {
      id: "profile",
      label: "Profile",
      Icon: User,
      dirty: profileDirty,
      render: () =>
        React.createElement(
          "div",
          {
            className: "crush-runner-section-body crush-runner-tab-panel",
            "data-dirty": profileDirty || undefined,
          },
          React.createElement(
            "div",
            { className: "crush-runner-fields" },
            React.createElement(
              "label",
              {
                className: "crush-runner-icon-label",
                htmlFor: "crush-runner-icon",
              },
              "Icon",
            ),
            React.createElement(
              crushRunnerDep("TerminalPresetIconPicker"),
              {
                id: "crush-runner-icon",
                value: draft.icon,
                onChange: (icon) => updateField("icon", icon),
              },
            ),
            React.createElement("label", {
              htmlFor: "crush-runner-name",
            }, "Preset name"),
            React.createElement("input", {
              id: "crush-runner-name",
              type: "text",
              value: draft.name,
              spellCheck: false,
              placeholder: "Crush",
              onChange: (event) => updateField("name", event.target.value),
            }),
            React.createElement("label", {
              htmlFor: "crush-runner-program",
            }, "Program"),
            React.createElement("input", {
              id: "crush-runner-program",
              type: "text",
              value: draft.program,
              spellCheck: false,
              placeholder: "crush",
              onChange: (event) => {
                // Once the user starts editing the program field we leave
                // it alone; detection results will no longer overwrite it.
                programAutoManagedRef.current = false;
                updateField("program", event.target.value);
              },
            }),
            React.createElement("label", {
              htmlFor: "crush-runner-args",
            }, "Startup arguments"),
            React.createElement("input", {
              id: "crush-runner-args",
              type: "text",
              value: draft.args,
              spellCheck: false,
              placeholder: "--help",
              onChange: (event) => updateField("args", event.target.value),
            }),
            React.createElement("label", {
              htmlFor: "crush-runner-type",
            }, "Runtime"),
            React.createElement(
              "select",
              {
                id: "crush-runner-type",
                value: draft.type,
                onChange: (event) => updateField("type", event.target.value),
              },
              React.createElement(
                "option",
                { value: "auto" },
                "Auto",
              ),
              React.createElement(
                "option",
                { value: "gojs" },
                "Go + JavaScript",
              ),
              React.createElement(
                "option",
                { value: "wasi" },
                "WASI",
              ),
              React.createElement(
                "option",
                { value: "js" },
                "JavaScript",
              ),
            ),
            React.createElement(
              "label",
              { htmlFor: "crush-runner-wd" },
              "Working directory",
            ),
            React.createElement("input", {
              id: "crush-runner-wd",
              type: "text",
              value: draft.wd,
              spellCheck: false,
              placeholder: ".",
              onChange: (event) => updateField("wd", event.target.value),
            }),
          ),
          React.createElement(
            "div",
            { className: "crush-runner-section-actions" },
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: resetProfileFields,
                disabled: !profileDirty,
                title: "Restore profile fields to the saved preset",
              },
              React.createElement(RefreshCw, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement("span", null, "Reset"),
            ),
          ),
        ),
    },
    {
      id: "config",
      label: "crushrc",
      Icon: FileCode,
      dirty: configDirty,
      render: () =>
        React.createElement(
          "div",
          {
            className: "crush-runner-section-body crush-runner-tab-panel",
            "data-dirty": configDirty || undefined,
          },
          React.createElement(
            "p",
            { className: "hint" },
            `Mounted inline at `,
            React.createElement(
              "code",
              null,
              `/${crushRunDirFor(params?.runnerId)}/crushrc`,
            ),
            ` inside the task via per-task `,
            React.createElement("code", null, "<wanix-bind>"),
            ` entries (a fresh ramfs at the per-launch subdirectory plus the user's rcfile), so each CrushRunner instance has its own providers, models, and UI options without touching any shared filesystem state.`,
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
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: resetCrushrcField,
                disabled: !configDirty,
                title: "Restore the built-in crushrc template",
              },
              React.createElement(RefreshCw, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement("span", null, "Reset"),
            ),
          ),
        ),
    },
    {
      id: "env",
      label: "Env",
      Icon: KeyRound,
      dirty: envDirty,
      render: () =>
        React.createElement(
          "div",
          {
            className: "crush-runner-section-body crush-runner-tab-panel",
          },
          React.createElement(
            "p",
            { className: "hint crush-runner-hint" },
            `Crush inherits the GearShell shell defaults (${
              crushRunnerDep("WANIX")
            }, ${
              crushRunnerDep("HOME")
            }, PATH, CRUSH_*, etc.). Add lines below to override or extend them in KEY=value format.`,
          ),
          React.createElement("textarea", {
            id: "crush-runner-env",
            className: "crush-runner-env",
            value: draft.env,
            spellCheck: false,
            placeholder: "CRUSH_LOG=info\nOPENAI_API_KEY=...",
            onChange: (event) => updateField("env", event.target.value),
          }),
          React.createElement(
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
                : `${envLines.length} override${
                  envLines.length === 1 ? "" : "s"
                }`,
            ),
            "Merged result: ",
            React.createElement(
              "code",
              null,
              `${
                envLines.length === 0 ? "(no overrides)" : envLines.join(" · ")
              }`,
            ),
          ),
          React.createElement(
            "div",
            { className: "crush-runner-section-actions" },
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: resetEnvField,
                disabled: !envDirty,
                title: "Restore env overrides to the saved preset",
              },
              React.createElement(RefreshCw, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement("span", null, "Reset"),
            ),
          ),
        ),
    },
    {
      id: "json",
      label: "JSON",
      Icon: Braces,
      dirty: jsonDraftDirty,
      render: () =>
        React.createElement(
          "div",
          {
            className: "crush-runner-section-body crush-runner-tab-panel",
            "data-dirty": jsonDraftDirty || undefined,
          },
          React.createElement(
            "p",
            { className: "hint" },
            `Full preset snapshot (profile + crushrc), pretty-printed with 2-space indent. Edits sync into the other tabs; press the Reset to discard them.`,
          ),
          React.createElement("textarea", {
            id: "crush-runner-json",
            className:
              "crush-runner-env crush-runner-crushrc crush-runner-json",
            value: jsonDraft,
            spellCheck: false,
            "aria-label": "preset JSON contents",
            placeholder: '{ "name": "Crush", ... }',
            onChange: (event) => applyJsonEdit(event.target.value),
          }),
          React.createElement(
            "div",
            { className: "crush-runner-section-actions" },
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: resetJsonDraft,
                disabled: !jsonDraftDirty,
                title:
                  "Discard JSON edits and revert to the current form state",
              },
              React.createElement(RefreshCw, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement("span", null, "Reset"),
            ),
            React.createElement(
              "button",
              {
                className: "mkt-btn mkt-btn-ghost",
                type: "button",
                onClick: copyProfileJson,
                title:
                  "Copy the current profile + crushrc to the clipboard for debugging or sharing",
              },
              React.createElement(Save, {
                size: 14,
                "aria-hidden": true,
              }),
              React.createElement("span", null, "Copy"),
            ),
          ),
        ),
    },
  ];
  const activeEntry = tabs.find((tab) => tab.id === activeTab) ||
    tabs[0];
  const onTabKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const idx = tabs.findIndex((tab) => tab.id === activeTab);
    if (idx === -1) return;
    const nextIdx = event.key === "ArrowLeft"
      ? (idx - 1 + tabs.length) % tabs.length
      : (idx + 1) % tabs.length;
    event.preventDefault();
    setActiveTab(tabs[nextIdx].id);
  };
  return React.createElement(
    "section",
    {
      className: "crush-runner-config",
      id: "crush-runner-config",
    },
    React.createElement(
      "div",
      {
        className: "crush-runner-tabs",
        role: "tablist",
        "aria-label": "Crush configuration",
      },
      tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return React.createElement(
          "button",
          {
            key: tab.id,
            type: "button",
            role: "tab",
            id: `crush-runner-tab-${tab.id}`,
            "aria-selected": isActive,
            "aria-controls": "crush-runner-tab-panel",
            tabIndex: isActive ? 0 : -1,
            className: `crush-runner-tab${isActive ? " active" : ""}`,
            onClick: () => setActiveTab(tab.id),
            onKeyDown: onTabKeyDown,
          },
          tab.Icon &&
            React.createElement(tab.Icon, {
              size: 14,
              "aria-hidden": true,
            }),
          React.createElement("span", {
            className: "crush-runner-tab-label",
          }, tab.label),
          tab.dirty &&
            React.createElement("span", {
              className: "crush-runner-tab-dirty",
              "aria-label": "Unsaved changes",
              title: "Unsaved changes",
            }, "*"),
        );
      }),
    ),
    React.createElement("div", {
      className: "crush-runner-section crush-runner-tab-section",
      role: "tabpanel",
      id: "crush-runner-tab-panel",
      "aria-labelledby": `crush-runner-tab-${activeEntry.id}`,
    }, activeEntry.render()),
    // The dedicated Terminal preview section was redundant with the
    // Launch / Restart CTAs in the hero: every preview path opens a
    // Crush session in a real dockview tab, so collapsing the inline
    // overlay left no UI to render here. The "Copy profile JSON"
    // action moved down to the crushrc tab footer next to the
    // reset button so debugging tools stay next to the data they dump.
    React.createElement(
      "p",
      { className: "crush-runner-footer" },
      `Profile last refreshed ${
        savedMarker === 0 ? "on first load" : "after the most recent save"
      }. Changes live in this panel until you press “Save as default”.`,
    ),
  );
}
