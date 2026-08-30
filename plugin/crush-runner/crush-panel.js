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
} from "./crush-deps.js";
import { useCrushRunnerPanelController } from "./crush-panel-controller.js";
import { CrushConfigSection } from "./crush-panel-config.js";
import {
  CrushCtaRow,
  CrushEditorToggle,
  CrushInstallBanner,
  CrushPresetBar,
  CrushRunnerStatus,
} from "./crush-runner-parts.js";
import htm from "htm";

const html = htm.bind(React.createElement);

function CrushHero({ children }) {
  return html`
    <header className="crush-runner-hero">
      <h1>Crush, in your browser.</h1>
      <p className="crush-runner-lede">Edit any field below, then Launch to open a Crush session in a new tab. Switch presets to compare configurations, or save the current form as a new preset.</p>
      ${children}
    </header>
  `;
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
  return html`
    <${React.Fragment}>
      <${CrushPresetBar} presets=${presets} activePreset=${activePreset} isDirty=${isDirty} activatePreset=${activatePreset} saveAsNewPreset=${saveAsNewPreset}/>
      <${CrushEditorToggle} formExpanded=${formExpanded} setFormExpanded=${setFormExpanded}/>
      <${CrushConfigSection} ctl=${ctl}/>
    </${React.Fragment}>
  `;
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
  return html`
    <div className="crush-runner-panel panel-content">
      <div className="crush-runner-shell">
        <${CrushHero}>
          ${!ctl.installBannerDismissed &&
            html`<${CrushInstallBanner} ...${installBannerProps(ctl)}/>`}
        </${CrushHero}>
        ${ctl.crushInstalled === true &&
          html`<${CrushInstalledSection} ...${installedSectionProps(ctl)}/>`}
        ${ctl.crushInstalled === null
          ? null
          : html`<${CrushCtaRow} ...${ctaRowProps(ctl)}/>`}
        <${CrushRunnerStatus} status=${ctl.status}/>
      </div>
    </div>
  `;
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
