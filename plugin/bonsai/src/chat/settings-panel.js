import {
  loadChatSettings,
  loadRuntimeMode,
  loadSystemPrompt,
  resolveSystemPrompt,
  saveChatSettings,
  saveRuntimeMode,
  saveSystemPrompt,
} from "./settings.js";

function byId(id) {
  return document.getElementById(id);
}

function fill(settings, hasHost) {
  byId("systemPromptInput").value = settings.systemPrompt ?? "";
  byId("temperatureInput").value = settings.temperature;
  byId("topPInput").value = settings.topP;
  byId("topKInput").value = settings.topK;
  byId("maxTokensInput").value = settings.maxTokens;
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

export function setupSettingsPanel(onSave, hasHost = true) {
  const overlay = byId("settingsOverlay");
  const close = () => {
    overlay.hidden = true;
    document.body.classList.remove("kx-locked");
  };
  byId("settingsBtn").addEventListener("click", () => {
    // Re-resolve the prompt on each open so the deployment-mode default
    // shows up in the textarea if the user hasn't edited it yet.
    const settings = loadChatSettings();
    settings.systemPrompt = resolveSystemPrompt(hasHost);
    fill(settings, hasHost);
    overlay.hidden = false;
    document.body.classList.add("kx-locked");
  });
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-settings-close]")) close();
  });
  byId("settingsSaveBtn").addEventListener("click", () => {
    const form = read();
    // Split: chat settings (numeric) go through saveChatSettings; the
    // system prompt is tracked separately so the deployment default can
    // re-take effect when the user clears it (vs. never-touched).
    onSave(saveChatSettings(form));
    saveSystemPrompt(form.systemPrompt);
    const runtimeSelect = byId("runtimeModeInput");
    if (runtimeSelect) saveRuntimeMode(runtimeSelect.value);
    close();
  });
  byId("settingsResetBtn").addEventListener("click", () => {
    // Reset also clears the user's prompt override so the deployment
    // default re-applies on next open.
    saveSystemPrompt(null);
    saveRuntimeMode("main");
    fill(saveChatSettings({}), hasHost);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });
}
