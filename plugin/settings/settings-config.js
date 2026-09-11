// Settings "Behavior" / "Wanix tools" form wiring.

import React from "react";
import htm from "htm";

const html = htm.bind(React.createElement);
import { createRoot } from "react-dom/client";
import { settingsDep } from "./settings-deps.js";
import { LauncherOrderEditor } from "./settings-launcher.js";
// `setupConfigForm` wires the "Behavior" / "Wanix tools" <details>
// blocks under the Settings panel: restore-tabs toggle, Wagi-Dog
// toggle, workbench/vm URL inputs, and the launcher ordering editor.
// All app.js globals it touches (config loaders, the panel-creation
// catalog, the workspace-changed event name, the Vm/Wisp URL
// normalizer) are passed via the dep shim so this helper stays
// loosely coupled to the rest of the shell.

function queryConfigElements(settingsContent) {
  return {
    launcherOrderList: settingsContent.querySelector(
      "[data-config-launcher-order]",
    ),
    restoreTabsEl: settingsContent.querySelector(
      '[data-config="restore-tabs"]',
    ),
    wagiDogEnabledEl: settingsContent.querySelector(
      '[data-config="wagi-dog-enabled"]',
    ),
    allowBgPlaybackEl: settingsContent.querySelector(
      '[data-config="allow-background-playback"]',
    ),
    playProgressDoneSoundEl: settingsContent.querySelector(
      '[data-config="play-progress-done-sound"]',
    ),
    widgetbotEl: settingsContent.querySelector(
      '[data-config="widgetbot"]',
    ),
    // Inference default model: drives the host's pre-warm at shell
    // boot. Populated dynamically from inference.list() once the host
    // is reachable so plugin manifests can register more models
    // without touching this module.
    inferenceModelEl: settingsContent.querySelector(
      '[data-config="default-inference-model"]',
    ),
    integrationEls: [
      ...settingsContent.querySelectorAll("[data-config-value]"),
    ],
    saveButton: settingsContent.querySelector('[data-config-action="save"]'),
    resetButton: settingsContent.querySelector('[data-config-action="reset"]'),
  };
}

function fillConfigFields(els, cfg) {
  if (els.restoreTabsEl) els.restoreTabsEl.checked = cfg.restoreTabs;
  if (els.wagiDogEnabledEl) els.wagiDogEnabledEl.checked = cfg.wagiDogEnabled;
  if (els.allowBgPlaybackEl) {
    els.allowBgPlaybackEl.checked = cfg.allowBackgroundPlayback !== false;
  }
  if (els.playProgressDoneSoundEl) {
    els.playProgressDoneSoundEl.checked = cfg.playProgressDoneSound !== false;
  }
  if (els.widgetbotEl) els.widgetbotEl.checked = cfg.widgetbot === true;
  if (els.inferenceModelEl) {
    // Keep the user's stored value if present; otherwise leave the
    // first option (set in the template) selected so the form always
    // shows a meaningful default before the host responds.
    const knownIds = [...els.inferenceModelEl.options].map((o) => o.value);
    const value = cfg.defaultInferenceModel && knownIds.includes(cfg.defaultInferenceModel)
      ? cfg.defaultInferenceModel
      : cfg.defaultInferenceModel ?? els.inferenceModelEl.value;
    if (value) els.inferenceModelEl.value = value;
  }
  for (const input of els.integrationEls) {
    input.value = cfg[input.dataset.configValue] || "";
  }
}

function flashConfigStatus(settingsContent, message, color) {
  const s = settingsContent.querySelector('[data-config="status"]');
  s.textContent = message;
  s.style.color = color;
  setTimeout(() => {
    s.textContent = "";
  }, 2000);
}

function wireConfigSave(settingsContent, els, showConfigStatus) {
  els.saveButton.addEventListener("click", () => {
    const config = settingsDep("loadConfig")();
    settingsDep("saveConfig")({
      ...config,
      restoreTabs: els.restoreTabsEl?.checked === true,
      wagiDogEnabled: els.wagiDogEnabledEl?.checked !== false,
      allowBackgroundPlayback: els.allowBgPlaybackEl?.checked !== false,
      playProgressDoneSound: els.playProgressDoneSoundEl?.checked !== false,
      widgetbot: els.widgetbotEl?.checked === true,
      defaultInferenceModel: els.inferenceModelEl?.value || config.defaultInferenceModel,
      ...Object.fromEntries(
        els.integrationEls.map((
          input,
        ) => [input.dataset.configValue, input.value]),
      ),
    });
    showConfigStatus(settingsContent, "Saved!", "#3fb950");
  });
}

function wireConfigReset(settingsContent, els, showConfigStatus) {
  els.resetButton.addEventListener("click", () => {
    const c = settingsDep("resetConfig")();
    fillConfigFields(els, c);
    showConfigStatus(settingsContent, "Reset to defaults.", "#8b949e");
  });
}

export function setupConfigForm(settingsContent) {
  const els = queryConfigElements(settingsContent);
  if (!els.saveButton || !els.resetButton) return;
  const launcherOrderRoot = els.launcherOrderList
    ? createRoot(els.launcherOrderList)
    : null;
  launcherOrderRoot?.render(html`<${LauncherOrderEditor}/>`);
  const populate = () => {
    fillConfigFields(els, settingsDep("loadConfig")());
  };
  populate();
  wireConfigSave(settingsContent, els, flashConfigStatus);
  wireConfigReset(settingsContent, els, flashConfigStatus);
  // Refresh the inference model dropdown from the host's manifest so
  // plugin manifests can register new models without editing the
  // template. Best-effort: if the host isn't ready (e.g. user is
  // editing settings before boot completes), the template's stock
  // option stays visible.
  populateInferenceModels(els).catch(() => {});
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), populate);
  return () => {
    window.removeEventListener(
      settingsDep("WORKSPACE_CHANGED_EVENT"),
      populate,
    );
    launcherOrderRoot?.unmount();
  };
}

// Refresh the default-model <select> from GearShell.inference.list().
// The template ships with Bonsai-27B hard-coded so the field renders
// before the host is reachable; this call adds any extra models the
// host knows about and selects the user's saved choice if present.
async function populateInferenceModels(els) {
  const select = els.inferenceModelEl;
  if (!select || typeof window.GearShell?.inference?.list !== "function") {
    return;
  }
  const models = await window.GearShell.inference.list();
  if (!Array.isArray(models) || models.length === 0) return;
  const existing = new Set([...select.options].map((o) => o.value));
  for (const model of models) {
    if (!model?.id || existing.has(model.id)) continue;
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label ?? model.id;
    select.appendChild(option);
  }
  fillConfigFields(els, settingsDep("loadConfig")());
}
