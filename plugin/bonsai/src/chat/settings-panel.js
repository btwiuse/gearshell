import { loadChatSettings, saveChatSettings, loadRuntimeMode, saveRuntimeMode } from "./settings.js";

function byId(id) {
  return document.getElementById(id);
}

function fill(settings) {
  byId("systemPromptInput").value = settings.systemPrompt;
  byId("temperatureInput").value = settings.temperature;
  byId("topPInput").value = settings.topP;
  byId("topKInput").value = settings.topK;
  byId("maxTokensInput").value = settings.maxTokens;
  // The runtime select is only in buildless.html; the bundled
  // index.html may not have it. Guard the assignment so an older
  // bundle doesn't throw when users reopen the settings overlay.
  const runtimeSelect = byId("runtimeModeInput");
  if (runtimeSelect) runtimeSelect.value = loadRuntimeMode();
}

function read() {
  return {
    systemPrompt: byId("systemPromptInput").value,
    temperature: byId("temperatureInput").value,
    topP: byId("topPInput").value,
    topK: byId("topKInput").value,
    maxTokens: byId("maxTokensInput").value,
  };
}

export function setupSettingsPanel(onSave) {
  const overlay = byId("settingsOverlay");
  const close = () => {
    overlay.hidden = true;
    document.body.classList.remove("kx-locked");
  };
  byId("settingsBtn").addEventListener("click", () => {
    fill(loadChatSettings());
    overlay.hidden = false;
    document.body.classList.add("kx-locked");
  });
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-settings-close]")) close();
  });
  byId("settingsSaveBtn").addEventListener("click", () => {
    onSave(saveChatSettings(read()));
    // Persist the runtime mode independently. It only takes effect on
    // the next page load (model + worker are already wired by then),
    // so we don't need to reload here — but we do show a confirmation
    // so the user knows their choice was saved. Guarded for older
    // bundles without the runtime select.
    const runtimeSelect = byId("runtimeModeInput");
    if (runtimeSelect) saveRuntimeMode(runtimeSelect.value);
    close();
  });
  byId("settingsResetBtn").addEventListener("click", () => {
    saveRuntimeMode("main");
    fill(saveChatSettings({}));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });
}
