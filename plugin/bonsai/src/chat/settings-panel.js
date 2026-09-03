import { loadChatSettings, saveChatSettings } from "./settings.js";

function byId(id) {
  return document.getElementById(id);
}

function fill(settings) {
  byId("systemPromptInput").value = settings.systemPrompt;
  byId("temperatureInput").value = settings.temperature;
  byId("topPInput").value = settings.topP;
  byId("topKInput").value = settings.topK;
  byId("maxTokensInput").value = settings.maxTokens;
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
    close();
  });
  byId("settingsResetBtn").addEventListener("click", () => fill(saveChatSettings({})));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });
}
