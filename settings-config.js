// Settings "Behavior" / "Wanix tools" form wiring.

import React from "react";
import { createRoot } from "react-dom/client";
import { settingsDep } from "./settings-deps.js?v=20260826.2";
import { LauncherOrderEditor } from "./settings-launcher.js?v=20260826.2";
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
    widgetbotEl: settingsContent.querySelector(
      '[data-config="widgetbot"]',
    ),
    integrationEls: [
      ...settingsContent.querySelectorAll("[data-config-value]"),
    ],
    vmNetworkModeEl: settingsContent.querySelector(
      '[data-config-value="vmNetworkMode"]',
    ),
    vmWispUrlEl: settingsContent.querySelector(
      '[data-config-value="vmWispUrl"]',
    ),
    saveButton: settingsContent.querySelector('[data-config-action="save"]'),
    resetButton: settingsContent.querySelector('[data-config-action="reset"]'),
  };
}

function syncVmNetworkFields(els) {
  if (!els.vmNetworkModeEl || !els.vmWispUrlEl) return;
  const enabled = els.vmNetworkModeEl.value === "wisp";
  els.vmWispUrlEl.disabled = !enabled;
  els.vmWispUrlEl.closest(".cfg-network-field")?.classList.toggle(
    "disabled",
    !enabled,
  );
}

function fillConfigFields(els, cfg) {
  if (els.restoreTabsEl) els.restoreTabsEl.checked = cfg.restoreTabs;
  if (els.wagiDogEnabledEl) els.wagiDogEnabledEl.checked = cfg.wagiDogEnabled;
  if (els.allowBgPlaybackEl) {
    els.allowBgPlaybackEl.checked = cfg.allowBackgroundPlayback !== false;
  }
  if (els.widgetbotEl) els.widgetbotEl.checked = cfg.widgetbot === true;
  for (const input of els.integrationEls) {
    input.value = cfg[input.dataset.configValue] || "";
  }
  syncVmNetworkFields(els);
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
    if (
      els.vmNetworkModeEl?.value === "wisp" &&
      !settingsDep("normalizeVmWispUrl")(els.vmWispUrlEl?.value)
    ) {
      showConfigStatus(
        settingsContent,
        "Enter a valid Wisp server URL.",
        "#f85149",
      );
      return;
    }
    const config = settingsDep("loadConfig")();
    settingsDep("saveConfig")({
      ...config,
      restoreTabs: els.restoreTabsEl?.checked === true,
      wagiDogEnabled: els.wagiDogEnabledEl?.checked !== false,
      allowBackgroundPlayback: els.allowBgPlaybackEl?.checked !== false,
      widgetbot: els.widgetbotEl?.checked === true,
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
  launcherOrderRoot?.render(React.createElement(LauncherOrderEditor));
  const populate = () => {
    fillConfigFields(els, settingsDep("loadConfig")());
  };
  populate();
  els.vmNetworkModeEl?.addEventListener(
    "change",
    () => syncVmNetworkFields(els),
  );
  wireConfigSave(settingsContent, els, flashConfigStatus);
  wireConfigReset(settingsContent, els, flashConfigStatus);
  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), populate);
  return () => {
    window.removeEventListener(
      settingsDep("WORKSPACE_CHANGED_EVENT"),
      populate,
    );
    launcherOrderRoot?.unmount();
  };
}
