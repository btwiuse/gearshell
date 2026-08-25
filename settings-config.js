// Settings "Behavior" / "Wanix tools" form wiring.

import React from "react";
import { createRoot } from "react-dom/client";
import { settingsDep } from "./settings-deps.js?v=20260826.1";
import { LauncherOrderEditor } from "./settings-launcher.js?v=20260826.1";
// `setupConfigForm` wires the "Behavior" / "Wanix tools" <details>
// blocks under the Settings panel: restore-tabs toggle, Wagi-Dog
// toggle, workbench/vm URL inputs, and the launcher ordering editor.
// All app.js globals it touches (config loaders, the panel-creation
// catalog, the workspace-changed event name, the Vm/Wisp URL
// normalizer) are passed via the dep shim so this helper stays
// loosely coupled to the rest of the shell.

export function setupConfigForm(settingsContent) {
  const launcherOrderList = settingsContent.querySelector(
    "[data-config-launcher-order]",
  );
  const restoreTabsEl = settingsContent.querySelector(
    '[data-config="restore-tabs"]',
  );
  const wagiDogEnabledEl = settingsContent.querySelector(
    '[data-config="wagi-dog-enabled"]',
  );
  const integrationEls = [
    ...settingsContent.querySelectorAll("[data-config-value]"),
  ];
  const vmNetworkModeEl = settingsContent.querySelector(
    '[data-config-value="vmNetworkMode"]',
  );
  const vmWispUrlEl = settingsContent.querySelector(
    '[data-config-value="vmWispUrl"]',
  );
  const saveButton = settingsContent.querySelector(
    '[data-config-action="save"]',
  );
  const resetButton = settingsContent.querySelector(
    '[data-config-action="reset"]',
  );
  if (!saveButton || !resetButton) return;
  const launcherOrderRoot = launcherOrderList
    ? createRoot(launcherOrderList)
    : null;
  launcherOrderRoot?.render(React.createElement(LauncherOrderEditor));

  const populate = () => {
    const cfg = settingsDep("loadConfig")();
    if (restoreTabsEl) restoreTabsEl.checked = cfg.restoreTabs;
    if (wagiDogEnabledEl) wagiDogEnabledEl.checked = cfg.wagiDogEnabled;
    for (const input of integrationEls) {
      input.value = cfg[input.dataset.configValue] || "";
    }
    syncVmNetworkFields();
  };
  const syncVmNetworkFields = () => {
    if (!vmNetworkModeEl || !vmWispUrlEl) return;
    const enabled = vmNetworkModeEl.value === "wisp";
    vmWispUrlEl.disabled = !enabled;
    vmWispUrlEl.closest(".cfg-network-field")?.classList.toggle(
      "disabled",
      !enabled,
    );
  };
  populate();

  vmNetworkModeEl?.addEventListener("change", syncVmNetworkFields);

  saveButton.addEventListener("click", () => {
    if (
      vmNetworkModeEl?.value === "wisp" &&
      !settingsDep("normalizeVmWispUrl")(vmWispUrlEl?.value)
    ) {
      const s = settingsContent.querySelector('[data-config="status"]');
      s.textContent = "Enter a valid Wisp server URL.";
      s.style.color = "#f85149";
      return;
    }
    const config = settingsDep("loadConfig")();
    settingsDep("saveConfig")({
      ...config,
      restoreTabs: restoreTabsEl?.checked === true,
      wagiDogEnabled: wagiDogEnabledEl?.checked !== false,
      ...Object.fromEntries(
        integrationEls.map((input) => [input.dataset.configValue, input.value]),
      ),
    });
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = "Saved!";
    s.style.color = "#3fb950";
    setTimeout(() => {
      s.textContent = "";
    }, 2000);
  });

  resetButton.addEventListener("click", () => {
    const c = settingsDep("resetConfig")();
    if (restoreTabsEl) restoreTabsEl.checked = c.restoreTabs;
    if (wagiDogEnabledEl) wagiDogEnabledEl.checked = c.wagiDogEnabled;
    for (const input of integrationEls) {
      input.value = c[input.dataset.configValue] || "";
    }
    syncVmNetworkFields();
    const s = settingsContent.querySelector('[data-config="status"]');
    s.textContent = "Reset to defaults.";
    s.style.color = "#8b949e";
    setTimeout(() => {
      s.textContent = "";
    }, 2000);
  });

  window.addEventListener(settingsDep("WORKSPACE_CHANGED_EVENT"), populate);
  return () => {
    window.removeEventListener(
      settingsDep("WORKSPACE_CHANGED_EVENT"),
      populate,
    );
    launcherOrderRoot?.unmount();
  };
}
