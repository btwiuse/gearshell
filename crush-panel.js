// The Crush Runner panel component: renders the controller's state
// into the hero, install banner, preset tiles, editor toggle, CTA row,
// and status line. The parts live in crush-runner-parts.js and the
// configuration section in crush-panel-config.js; all state and
// handlers come from useCrushRunnerPanelController.

import React from "react";
import {
  adoptCrushRunnerId,
  crushRunnerDep,
  nextCrushRunnerId,
} from "./crush-deps.js?v=20260826.2";
import { useCrushRunnerPanelController } from "./crush-panel-controller.js?v=20260826.2";
import { CrushConfigSection } from "./crush-panel-config.js?v=20260826.3";
import {
  CrushCtaRow,
  CrushEditorToggle,
  CrushInstallBanner,
  CrushPresetBar,
  CrushRunnerStatus,
} from "./crush-runner-parts.js?v=20260828.2";

function CrushHero({ children }) {
  return React.createElement(
    "header",
    { className: "crush-runner-hero" },
    React.createElement("h1", null, "Crush, in your browser."),
    React.createElement(
      "p",
      { className: "crush-runner-lede" },
      "Edit any field below, then Launch to open a Crush session in a new tab. Switch presets to compare configurations, or save the current form as a new preset.",
    ),
    children,
  );
}

function CrushInstalledSection(props) {
  const {
    ctl,
    presets,
    activePreset,
    isDirty,
    activatePreset,
    saveAsNewPreset,
    formExpanded,
    setFormExpanded,
  } = props;
  return React.createElement(
    React.Fragment,
    null,
    // Preset switcher: a grid of square icon tiles that mirrors
    // the settings panel's icon picker; clicking a tile activates
    // that preset, the New slot saves the form as a new preset.
    React.createElement(CrushPresetBar, {
      presets,
      activePreset,
      isDirty,
      activatePreset,
      saveAsNewPreset,
    }),
    // Editor toggle: the configuration section starts hidden so
    // the default view reads as "ready to launch". The toggle
    // alone controls formExpanded.
    React.createElement(CrushEditorToggle, {
      formExpanded,
      setFormExpanded,
    }),
    React.createElement(CrushConfigSection, { ctl }),
  );
}

function installBannerProps(ctl) {
  return {
    crushInstalled: ctl.crushInstalled,
    installing: ctl.installing,
    detectSource: ctl.detectSource,
    installBannerDismissed: ctl.installBannerDismissed,
    setInstallBannerDismissed: ctl.setInstallBannerDismissed,
    handleInstall: ctl.handleInstall,
    recheckCtx: {
      programAutoManagedRef: ctl.programAutoManagedRef,
      setCrushInstalled: ctl.setCrushInstalled,
      setDetectSource: ctl.setDetectSource,
      applyDetectedProgram: ctl.applyDetectedProgram,
    },
  };
}

function installedSectionProps(ctl) {
  return {
    ctl,
    presets: ctl.presets,
    activePreset: ctl.activePreset,
    isDirty: ctl.isDirty,
    activatePreset: ctl.activatePreset,
    saveAsNewPreset: ctl.saveAsNewPreset,
    formExpanded: ctl.formExpanded,
    setFormExpanded: ctl.setFormExpanded,
  };
}

function ctaRowProps(ctl) {
  return {
    activePreset: ctl.activePreset,
    isDirty: ctl.isDirty,
    crushInstalled: ctl.crushInstalled,
    installing: ctl.installing,
    commandPreview: ctl.commandPreview,
    deleteActivePreset: ctl.deleteActivePreset,
    saveUpdates: ctl.saveUpdates,
    launchCrush: ctl.launchCrush,
  };
}

export function CrushRunnerPanel({ api, params, containerApi }) {
  const ctl = useCrushRunnerPanelController({ api, params, containerApi });
  return React.createElement(
    "div",
    { className: "crush-runner-panel panel-content" },
    React.createElement(
      "div",
      { className: "crush-runner-shell" },
      // Hero mirrors the landing page so launching Crush feels like pressing
      // the Open Terminal CTA: kicker, headline, lede, then the install
      // banner. The banner lives inside the hero so its bottom border
      // closes the section below the diagnostic, as before the split.
      React.createElement(
        CrushHero,
        null,
        // Per-session dismiss: hide the whole banner when the user
        // clicks the close glyph. The state lives in a useState hook
        // so a page reload restores the banner without any
        // persistent storage side effects.
        !ctl.installBannerDismissed &&
          React.createElement(CrushInstallBanner, installBannerProps(ctl)),
      ),
      // Below the install banner we only show configuration controls when
      // Crush is actually installed. While the install probe is in flight
      // (null) or the binary is missing (false) we hide the rest of the
      // panel so the user focuses on resolving the install first.
      ctl.crushInstalled === true &&
        React.createElement(CrushInstalledSection, installedSectionProps(ctl)),
      // CTA row pinned to the bottom of the panel so launching Crush is
      // the last thing the user reaches. Hidden entirely while install
      // detection is in flight so the page focuses on the banner above.
      ctl.crushInstalled === null
        ? null
        : React.createElement(CrushCtaRow, ctaRowProps(ctl)),
      // Status banner sits under the CTA row so a "Saved updates" or
      // "Reset profile fields" message appears right next to the button
      // that triggered it.
      React.createElement(CrushRunnerStatus, { status: ctl.status }),
    ),
  );
}

// Register a new CrushRunner panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Crush Runner from the panel
// menu, and from the restore-saved-panels path on boot.
export function addCrushRunnerPanel(api, group, options = {}) {
  const id = nextCrushRunnerId();
  const panel = api.addPanel({
    id: `crush-runner-${id}`,
    component: "crush-runner",
    params: { crushRunnerId: id, panelType: "crush-runner" },
    title: "Crush Runner",
    ...options,
    ...(group && { position: { referenceGroup: group } }),
  });
  adoptCrushRunnerId(id);
  const rememberOpenPanel = crushRunnerDep("rememberOpenPanel");
  rememberOpenPanel(panel, { component: "crush-runner" });
  panel.api.setActive();
  return panel;
}
