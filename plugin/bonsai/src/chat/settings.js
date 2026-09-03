const SETTINGS_KEY = "bonsai_chat_settings_v1";

const DEFAULTS = {
  systemPrompt: "You are Bonsai, a local AI assistant. Be candid about uncertainty, distinguish verified facts from inference, and never invent tool results or external facts. Do not claim to be GearShell. Reply in the user's language. When tools are enabled, use them for current sandbox facts and report their output faithfully.",
  temperature: 0.5,
  topP: 0.85,
  topK: 20,
  maxTokens: 1024,
};

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalize(value = {}) {
  return {
    systemPrompt: typeof value.systemPrompt === "string" ? value.systemPrompt.trim() : DEFAULTS.systemPrompt,
    temperature: clamp(value.temperature, DEFAULTS.temperature, 0, 2),
    topP: clamp(value.topP, DEFAULTS.topP, 0, 1),
    topK: Math.round(clamp(value.topK, DEFAULTS.topK, 1, 100)),
    maxTokens: Math.round(clamp(value.maxTokens, DEFAULTS.maxTokens, 64, 4096)),
  };
}

export function loadChatSettings() {
  try {
    return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveChatSettings(settings) {
  const normalized = normalize(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function buildGenerationOptions(settings) {
  return {
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    maxTokens: settings.maxTokens,
  };
}

export function buildConversation(messages, systemPrompt) {
  return systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;
}
