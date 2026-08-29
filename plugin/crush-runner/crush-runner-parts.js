// Crush Runner panel parts: the hero, install banner, preset tiles,
// editor toggle, CTA row and status line as standalone components
// (split out of crush-panel.js so no component exceeds 50 lines and
// no file exceeds the 500-line budget). All state and handlers come
// from the controller via props.

import React from "react";
import {
  ArrowRight,
  Download,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { crushRunnerDep } from "./crush-deps.js?v=20260828.4";
import { detectCrushInstallation } from "./crush-install.js?v=20260828.110";

function CrushInstallBody({
  crushInstalled,
  detectSource,
  installing,
  handleInstall,
}) {
  const via = (detectSource.split(" → ")[0]) || "which crush";
  const path = (detectSource.split(" → ")[1]) || "crush";
  return React.createElement(
    "div",
    { className: "crush-runner-install-body" },
    React.createElement(
      "div",
      { className: "crush-runner-install-title" },
      crushInstalled === null
        ? "Checking Crush installation…"
        : crushInstalled
        ? `Crush is installed and ready to launch · ${via}`
        : "Crush is not installed",
    ),
    React.createElement(
      "p",
      { className: "crush-runner-install-copy" },
      crushInstalled === null
        ? "Probing the kernel environment with `command -v crush`."
        : crushInstalled
        ? React.createElement(
          "span",
          null,
          "Resolved at ",
          React.createElement("code", null, path),
          ". Press Launch below to open a session with the configured profile.",
        )
        : React.createElement(
          "span",
          null,
          "`which crush` returned no match. Trigger ",
          React.createElement("code", null, "w9y mod apply crush"),
          " to download and bind the Crush binary, then come back to launch it.",
        ),
    ),
    // The action row sits inside the body column (not the icon's 36px
    // grid track) so the chip and the Install button read as the
    // explanation-and-action pair under the copy. Code chip first in
    // source order so the column media query at narrow widths can stack
    // chip-over-button without DOM order and Tab key order diverging.
    crushInstalled !== true &&
      React.createElement(CrushInstallActions, {
        crushInstalled,
        installing,
        handleInstall,
      }),
  );
}

function CrushInstallIcon({ crushInstalled }) {
  return React.createElement(
    "div",
    { className: "crush-runner-install-icon", "aria-hidden": true },
    crushInstalled === null
      ? React.createElement(RefreshCw, {
        size: 18,
        className: "crush-runner-install-spin",
      })
      : crushInstalled
      ? React.createElement(Rocket, { size: 18 })
      : React.createElement(Download, { size: 18 }),
  );
}

function CrushInstallActions({ crushInstalled, installing, handleInstall }) {
  return React.createElement(
    "div",
    { className: "crush-runner-install-actions" },
    React.createElement("code", {
      className: "crush-runner-install-cmd",
    }, "$ w9y mod apply crush"),
    React.createElement(
      "button",
      {
        className: "mkt-btn mkt-btn-primary crush-runner-install-btn",
        type: "button",
        onClick: handleInstall,
        disabled: installing || crushInstalled === null,
        "aria-label": "Install Crush",
        title: crushInstalled === null
          ? "Waiting for detection to finish"
          : "Run w9y mod apply crush",
      },
      React.createElement(installing ? RefreshCw : Download, {
        size: 14,
        "aria-hidden": true,
        className: installing ? "crush-runner-install-spin" : undefined,
      }),
      React.createElement(
        "span",
        null,
        installing ? "Installing…" : "Install Crush",
      ),
    ),
  );
}

async function recheckInstall(ctx) {
  ctx.programAutoManagedRef.current = true;
  ctx.setCrushInstalled(null);
  ctx.setDetectSource("re-detecting via which crush…");
  const result = await detectCrushInstallation();
  if (result) {
    ctx.setCrushInstalled(result.installed);
    ctx.setDetectSource(
      result.path
        ? `${result.via} → ${result.path}`
        : (result.via || "which crush"),
    );
    if (result.installed && result.path) {
      ctx.applyDetectedProgram(result.path);
    }
  }
}

function CrushBannerControls(
  { installing, setInstallBannerDismissed, recheckCtx },
) {
  return React.createElement(
    React.Fragment,
    null,
    !installing &&
      React.createElement(
        "button",
        {
          type: "button",
          className: "mkt-btn mkt-btn-ghost crush-runner-install-recheck",
          onClick: () => recheckInstall(recheckCtx),
          title:
            "Re-run which crush and sync the program field to the resolved path",
          "aria-label": "Re-check Crush installation",
        },
        React.createElement(RefreshCw, { size: 11, "aria-hidden": true }),
      ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "crush-runner-install-close",
        onClick: () => setInstallBannerDismissed(true),
        title: "Hide the install banner for this session",
        "aria-label": "Hide the install banner",
      },
      React.createElement(X, { size: 12, "aria-hidden": true }),
    ),
  );
}

export function CrushInstallBanner(props) {
  const {
    crushInstalled,
    installing,
    detectSource,
    setInstallBannerDismissed,
    handleInstall,
    recheckCtx,
  } = props;
  return React.createElement(
    "div",
    {
      className: "crush-runner-install",
      "data-state": crushInstalled === null
        ? "checking"
        : crushInstalled
        ? "installed"
        : "missing",
    },
    React.createElement(CrushBannerControls, {
      installing,
      setInstallBannerDismissed,
      recheckCtx,
    }),
    React.createElement(CrushInstallIcon, { crushInstalled }),
    React.createElement(CrushInstallBody, {
      crushInstalled,
      detectSource,
      installing,
      handleInstall,
    }),
  );
}

export function CrushPresetTile({ preset, isActive, isDirty, onActivate }) {
  const iconCatalog = crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID");
  const Icon = (iconCatalog[preset.icon] || iconCatalog.bot ||
    iconCatalog.terminal).icon;
  return React.createElement(
    "button",
    {
      key: preset.id,
      type: "button",
      role: "radio",
      "aria-checked": isActive,
      "aria-label": isActive
        ? `Currently editing ${preset.name}`
        : `Switch to ${preset.name}`,
      className: `crush-runner-preset-tile${isActive ? " selected" : ""}${
        preset.builtin ? " builtin" : ""
      }`,
      title: preset.builtin
        ? `Built-in ${preset.name}`
        : `${preset.name} preset`,
      onClick: () => onActivate(preset),
    },
    React.createElement(Icon, { size: 22, "aria-hidden": true }),
    React.createElement("span", {
      className: "crush-runner-preset-tile-name",
    }, preset.name),
    isActive && isDirty &&
      React.createElement("span", {
        className: "crush-runner-preset-tile-dirty",
        "aria-label": "Modified",
        title: "Form differs from this preset",
      }, "•"),
  );
}

export function CrushPresetBar({
  presets,
  activePreset,
  isDirty,
  activatePreset,
  saveAsNewPreset,
}) {
  return React.createElement(
    "div",
    {
      className: "crush-runner-presets",
      role: "radiogroup",
      "aria-label": "Crush presets",
    },
    ...presets.map((preset) =>
      React.createElement(CrushPresetTile, {
        key: preset.id,
        preset,
        isActive: preset.id === activePreset.id,
        isDirty,
        onActivate: activatePreset,
      })
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "crush-runner-preset-tile crush-runner-preset-tile-add",
        title: "Save current form as a new preset",
        "aria-label": "Save current form as a new preset",
        onClick: saveAsNewPreset,
      },
      React.createElement(Plus, { size: 22, "aria-hidden": true }),
      React.createElement("span", null, "New"),
    ),
  );
}

export function CrushEditorToggle({ formExpanded, setFormExpanded }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "crush-runner-editor-toggle",
      "aria-expanded": formExpanded,
      "aria-controls": "crush-runner-config",
      onClick: () => setFormExpanded((value) => !value),
    },
    React.createElement(SlidersHorizontal, {
      size: 14,
      "aria-hidden": true,
    }),
    React.createElement(
      "span",
      null,
      formExpanded ? "Hide editor" : "Edit preset",
    ),
  );
}

function CrushLaunchButton({
  crushInstalled,
  installing,
  commandPreview,
  launchCrush,
}) {
  return React.createElement(
    "button",
    {
      className: "mkt-btn mkt-btn-primary crush-runner-launch",
      type: "button",
      onClick: launchCrush,
      disabled: crushInstalled !== true || installing,
      title: crushInstalled === null
        ? "Checking…"
        : crushInstalled === true
        ? (commandPreview || "crush")
        : "Install Crush first to enable launching",
      "aria-label": "Launch",
    },
    React.createElement(crushInstalled === null ? RefreshCw : Zap, {
      size: 16,
      "aria-hidden": true,
      className: crushInstalled === null
        ? "crush-runner-install-spin"
        : undefined,
    }),
    React.createElement(
      "span",
      null,
      crushInstalled === null ? "Checking…" : "Launch",
    ),
    crushInstalled !== null &&
      React.createElement(ArrowRight, { size: 14, "aria-hidden": true }),
  );
}

function CrushRemoveButton({ activePreset, deleteActivePreset }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "crush-runner-preset-remove",
      title: `Remove "${activePreset.name}" preset`,
      onClick: () => {
        if (
          window.confirm(
            `Remove preset "${activePreset.name}"? Built-in Crush will become active again.`,
          )
        ) {
          deleteActivePreset();
        }
      },
    },
    React.createElement(RefreshCw, { size: 13, "aria-hidden": true }),
    React.createElement("span", null, "Remove"),
  );
}

export function CrushCtaRow({
  activePreset,
  isDirty,
  crushInstalled,
  installing,
  commandPreview,
  deleteActivePreset,
  saveUpdates,
  launchCrush,
}) {
  return React.createElement(
    "div",
    { className: "crush-runner-cta" },
    !activePreset.builtin && React.createElement(CrushRemoveButton, {
      activePreset,
      deleteActivePreset,
    }),
    React.createElement(
      "div",
      { className: "crush-runner-cta-actions" },
      React.createElement(
        "button",
        {
          className: "mkt-btn mkt-btn-ghost",
          type: "button",
          onClick: saveUpdates,
          disabled: !isDirty,
          title: `Save updates to the active preset "${activePreset.name}"`,
        },
        React.createElement(Save, { size: 16, "aria-hidden": true }),
        React.createElement("span", null, "Save"),
      ),
      React.createElement(CrushLaunchButton, {
        crushInstalled,
        installing,
        commandPreview,
        launchCrush,
      }),
    ),
  );
}

export function CrushRunnerStatus({ status }) {
  return React.createElement("p", {
    className: "crush-runner-status",
    role: "status",
    "aria-live": "polite",
    "data-error": status.isError || undefined,
    hidden: !status.message,
  }, status.message);
}
