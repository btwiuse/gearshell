// The Crush Runner panel component: renders the controller's state into
// the hero, install banner, preset tiles, editor toggle, CTA row, and
// status line. The configuration section lives in crush-panel-config.js;
// all state and handlers come from useCrushRunnerPanelController.

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

import {
  crushRunnerDep,
  nextCrushRunnerId,
  adoptCrushRunnerId,
} from "./crush-deps.js?v=20260825.1";
import { detectCrushInstallation } from "./crush-install.js?v=20260825.1";
import { useCrushRunnerPanelController } from "./crush-panel-controller.js?v=20260825.1";
import { CrushConfigSection } from "./crush-panel-config.js?v=20260825.1";

export function CrushRunnerPanel({ api, params, containerApi }) {
  const ctl = useCrushRunnerPanelController({ api, params, containerApi });
  const {
    presets,
    activePreset,
    status,
    savedMarker,
    crushInstalled,
    installing,
    detectSource,
    installBannerDismissed,
    setInstallBannerDismissed,
    programAutoManagedRef,
    applyDetectedProgram,
    setCrushInstalled,
    setDetectSource,
    formExpanded,
    setFormExpanded,
    handleInstall,
    isDirty,
    activatePreset,
    saveAsNewPreset,
    saveUpdates,
    deleteActivePreset,
    launchCrush,
    commandPreview,
  } = ctl;

  return React.createElement(
    "div",
    { className: "crush-runner-panel panel-content" },
    React.createElement(
      "div",
      { className: "crush-runner-shell" },
      // Hero mirrors the landing page so launching Crush feels like pressing
      // the Open Terminal CTA: kicker, headline, lede, primary CTA, ghost CTA.
      React.createElement(
        "header",
        { className: "crush-runner-hero" },
        React.createElement("h1", null, "Crush, in your browser."),
        React.createElement(
          "p",
          { className: "crush-runner-lede" },
          "Edit any field below, then Launch to open a Crush session in a new tab. Switch presets to compare configurations, or save the current form as a new preset.",
        ),
        // Per-session dismiss: hide the whole banner when the user
        // clicks the close glyph. The state lives in a useState hook
        // so a page reload restores the banner without any
        // persistent storage side effects.
        !installBannerDismissed &&
          React.createElement(
            "div",
            {
              className: "crush-runner-install",
              "data-state": crushInstalled === null
                ? "checking"
                : crushInstalled
                ? "installed"
                : "missing",
            },
            !installing &&
              React.createElement(
                "button",
                {
                  type: "button",
                  className:
                    "mkt-btn mkt-btn-ghost crush-runner-install-recheck",
                  onClick: async () => {
                    // Hand control of the program field back to detection so the
                    // resolved binary path overwrites whatever the user typed (or
                    // Reset reset to 'crush'). Escape hatch when auto-sync has
                    // gotten out of sync with reality.
                    programAutoManagedRef.current = true;
                    setCrushInstalled(null);
                    setDetectSource("re-detecting via which crush…");
                    const result = await detectCrushInstallation();
                    if (result) {
                      setCrushInstalled(result.installed);
                      setDetectSource(
                        result.path
                          ? `${result.via} → ${result.path}`
                          : (result.via || "which crush"),
                      );
                      if (result.installed && result.path) {
                        applyDetectedProgram(result.path);
                      }
                    }
                  },
                  title:
                    "Re-run which crush and sync the program field to the resolved path",
                  "aria-label": "Re-check Crush installation",
                },
                React.createElement(RefreshCw, {
                  size: 11,
                  "aria-hidden": true,
                }),
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
            React.createElement(
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
            ),
            React.createElement(
              "div",
              { className: "crush-runner-install-body" },
              React.createElement(
                "div",
                { className: "crush-runner-install-title" },
                crushInstalled === null
                  ? "Checking Crush installation…"
                  : crushInstalled
                  ? `Crush is installed and ready to launch · ${
                    (detectSource.split(" → ")[0]) || "which crush"
                  }`
                  : "Crush is not installed",
              ),
              React.createElement(
                "p",
                { className: "crush-runner-install-copy" },
                crushInstalled === null
                  ? "Probing PATH via `which crush` to resolve the binary location."
                  : crushInstalled
                  ? React.createElement(
                    "span",
                    null,
                    "Resolved at ",
                    React.createElement(
                      "code",
                      null,
                      (detectSource.split(" → ")[1]) || "crush",
                    ),
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
              crushInstalled !== true &&
                React.createElement(
                  "div",
                  { className: "crush-runner-install-actions" },
                  // Code chip first in source order so the column-reverse
                  // media query at narrow widths can stack chip-over-button
                  // without the DOM order and Tab key order diverging.
                  React.createElement("code", {
                    className: "crush-runner-install-cmd",
                  }, "$ w9y mod apply crush"),
                  React.createElement(
                    "button",
                    {
                      className:
                        "mkt-btn mkt-btn-primary crush-runner-install-btn",
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
                      className: installing
                        ? "crush-runner-install-spin"
                        : undefined,
                    }),
                    React.createElement(
                      "span",
                      null,
                      installing ? "Installing…" : "Install Crush",
                    ),
                  ),
                ),
            ),
          ),
        // Below the install banner we only show configuration controls when
        // Crush is actually installed. While the install probe is in flight
        // (null) or the binary is missing (false) we hide the rest of the
        // panel so the user focuses on resolving the install first.
        crushInstalled === true && React.createElement(
          React.Fragment,
          null,
          // Kicker surfaces the currently active preset name so the user
          // sees at a glance which configuration the page is editing. Sits
          // between the install banner (the diagnostic) and the preset bar
          // (the picker) so the eye flows: install OK → which preset? → Launch.
          // Preset switcher above the install banner: a grid of square
          // icon tiles that mirrors the settings panel's icon picker.
          // Each preset becomes a tappable tile (icon over name); the
          // New preset slot is a dashed-border tile with a Plus glyph.
          // Clicking a tile activates that preset; the active tile gets
          // the same blue ring the icon picker uses for its selection.
          React.createElement(
            "div",
            {
              className: "crush-runner-presets",
              role: "radiogroup",
              "aria-label": "Crush presets",
            },
            presets.map((preset) => {
              const Icon =
                (crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID")[preset.icon] ||
                  crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID").bot ||
                  crushRunnerDep("TERMINAL_PRESET_ICON_BY_ID").terminal).icon;
              const isActive = preset.id === activePreset.id;
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
                  className: `crush-runner-preset-tile${
                    isActive ? " selected" : ""
                  }${preset.builtin ? " builtin" : ""}`,
                  title: preset.builtin
                    ? `Built-in ${preset.name}`
                    : `${preset.name} preset`,
                  onClick: () => activatePreset(preset),
                },
                React.createElement(Icon, { size: 22, "aria-hidden": true }),
                React.createElement("span", {
                  className: "crush-runner-preset-tile-name",
                }, preset.name),
                preset.id === activePreset.id && isDirty &&
                  React.createElement("span", {
                    className: "crush-runner-preset-tile-dirty",
                    "aria-label": "Modified",
                    title: "Form differs from this preset",
                  }, "•"),
              );
            }),
            React.createElement(
              "button",
              {
                type: "button",
                className:
                  "crush-runner-preset-tile crush-runner-preset-tile-add",
                title: "Save current form as a new preset",
                "aria-label": "Save current form as a new preset",
                onClick: saveAsNewPreset,
              },
              React.createElement(Plus, { size: 22, "aria-hidden": true }),
              React.createElement("span", null, "New"),
            ),
          ),
          // Editor toggle: the configuration section starts hidden so
          // the default view reads as "ready to launch". The toggle
          // alone controls formExpanded — preset switches and saves
          // leave it alone so the editor stays open across changes.
          // Only available once Crush is installed, since editing
          // before that point is wasted work.
          crushInstalled === true &&
            React.createElement(
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
            ),
          React.createElement(CrushConfigSection, { ctl }),
        ),
        // CTA row pinned to the bottom of the panel so launching Crush is
        // the last thing the user reaches, regardless of which tab they
        // were editing. The destructive Remove preset button lives on the
        // left of the row (only for non-builtin presets); the save / copy
        // / launch actions stay right-aligned. Hidden entirely while Crush
        // install detection is in flight so the page focuses on the
        // banner above.
        crushInstalled === null ? null : React.createElement(
          "div",
          { className: "crush-runner-cta" },
          !activePreset.builtin && React.createElement(
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
          ),
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
                title:
                  `Save updates to the active preset "${activePreset.name}"`,
              },
              React.createElement(Save, { size: 16, "aria-hidden": true }),
              React.createElement("span", null, "Save"),
            ),
            // Primary CTA on the right: the page is the Crush runner, so the
            // brand is implied and "Launch" reads as "Launch Crush" without
            // the word repeating on every adjacent control.
            React.createElement(
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
              React.createElement(
                crushInstalled === null ? RefreshCw : Zap,
                {
                  size: 16,
                  "aria-hidden": true,
                  className: crushInstalled === null
                    ? "crush-runner-install-spin"
                    : undefined,
                },
              ),
              React.createElement(
                "span",
                null,
                crushInstalled === null ? "Checking…" : "Launch",
              ),
              crushInstalled !== null &&
                React.createElement(ArrowRight, {
                  size: 14,
                  "aria-hidden": true,
                }),
            ),
          ),
        ),
        // Status banner sits under the CTA row so a "Saved updates" or
        // "Reset profile fields" message appears right next to the button
        // that triggered it instead of floating above the form.
        React.createElement("p", {
          className: "crush-runner-status",
          role: "status",
          "aria-live": "polite",
          "data-error": status.isError || undefined,
          hidden: !status.message,
        }, status.message),
      ),
    ),
  );
}

// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.
export function addCrushRunnerPanel(api, group, options = {}) {
  // The restore-saved-panels path can hand us back the original panel id
  // so reloads keep the same numeric label on the Crush Runner tab;
  // otherwise we mint a fresh one from the module-level counter. When
  // restoring we also lift the counter past the restored id so a later
  // "new panel" action does not collide with it.
  const restoredId = Number(options.id);
  const id = Number.isFinite(restoredId) && restoredId > 0
    ? restoredId
    : nextCrushRunnerId();
  adoptCrushRunnerId(id);
  const panel = api.addPanel({
    id: `crush-runner-${id}`,
    component: "crush-runner",
    params: { runnerId: id, panelType: "crush-runner" },
    title: `Crush Runner ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = crushRunnerDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "crush-runner", panelId: panel.id });
  panel.api.setActive();
  return panel;
}
