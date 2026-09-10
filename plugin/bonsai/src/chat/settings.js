const SETTINGS_KEY = "bonsai_chat_settings_v1";
const PROMPT_KEY = "bonsai_system_prompt_v1";
const RUNTIME_KEY = "bonsai_runtime_v1";

// Hosted (GearShell available): mention tools so the model knows it
// can call bash_run / future tools and faithfully reports their output.
const HOSTED_SYSTEM_PROMPT =
  "You are Bonsai, a local AI assistant. Be candid about uncertainty, distinguish verified facts from inference, and never invent tool results or external facts. Do not claim to be GearShell. Reply in the user's language. When tools are enabled, use them for current sandbox facts and report their output faithfully.";

// Standalone (no GearShell host — gear.sh/plugin/bonsai/buildless.html
// opened without a shell). Match the upstream bonsai/ root page's
// implicit "no system prompt" behaviour — let the model speak for
// itself without any flavour text the host doesn't need to know.
const STANDALONE_SYSTEM_PROMPT = null;

const DEFAULTS = Object.freeze({
  systemPrompt: HOSTED_SYSTEM_PROMPT,
  temperature: 0.5,
  topP: 0.85,
  topK: 20,
  maxTokens: 1024,
});

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

function loadChatSettings() {
  try {
    return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULTS };
  }
}

// System prompt is tracked separately so the deployment-mode default
// (hosted vs standalone) takes effect even after a user has set other
// chat settings (temperature etc). Saves happen through saveSystemPrompt;
// if the user never edited the prompt, this returns null and the caller
// falls back to defaultSystemPrompt(hasHost).
function loadSystemPrompt() {
  try {
    const raw = localStorage.getItem(PROMPT_KEY);
    if (raw === null) return null;
    return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveSystemPrompt(prompt) {
  try {
    if (typeof prompt === "string" && prompt.length > 0) {
      localStorage.setItem(PROMPT_KEY, prompt);
    } else {
      localStorage.removeItem(PROMPT_KEY);
    }
  } catch {}
}

// Picks the default system prompt appropriate for the deployment mode.
// Hosted shells get the tools-aware variant; standalone deployments
// (no GearShell.bash.run) get null so the chat loop skips the system
// message entirely, matching upstream bonsai/. Called once at module
// init because the prompt doesn't change while the page is open
// (shell presence is fixed for the lifetime of the tab).
function defaultSystemPrompt(hasHost) {
  return hasHost ? HOSTED_SYSTEM_PROMPT : STANDALONE_SYSTEM_PROMPT;
}

// Returns the system prompt to use for the current session:
// 1. explicit user override if one was saved
// 2. otherwise the deployment-mode default
function resolveSystemPrompt(hasHost) {
  const userOverride = loadSystemPrompt();
  if (userOverride !== null) return userOverride;
  return defaultSystemPrompt(hasHost);
}

function saveChatSettings(settings) {
  const normalized = normalize(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

// Runtime mode controls whether inference runs on the main thread
// (Bonsai27B) or in a Worker (WorkerBonsai27B). Worker keeps inference
// off the UI thread so the paint throttler / markdown reparse cannot
// starve the GPU queue; main thread is the original path, useful for
// debugging or when the worker refuses to load. Default is `main`
// (round 66 revert of round 65's switch — the user controls the
// trade-off explicitly). A `?runtime=worker` / `?runtime=main` query
// always wins so we can A/B test without touching storage.
function loadRuntimeMode() {
  const query = new URLSearchParams(location.search).get("runtime");
  if (query === "worker" || query === "main") return query;
  try {
    const stored = localStorage.getItem(RUNTIME_KEY);
    if (stored === "worker" || stored === "main") return stored;
  } catch {}
  return "main";
}

function saveRuntimeMode(mode) {
  if (mode !== "worker" && mode !== "main") return;
  try {
    localStorage.setItem(RUNTIME_KEY, mode);
  } catch {}
}

function buildGenerationOptions(settings) {
  return {
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    maxTokens: settings.maxTokens,
  };
}

function buildConversation(messages, systemPrompt) {
  return systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;
}

export {
  DEFAULTS,
  buildConversation,
  buildGenerationOptions,
  defaultSystemPrompt,
  loadChatSettings,
  loadRuntimeMode,
  loadSystemPrompt,
  resolveSystemPrompt,
  saveChatSettings,
  saveRuntimeMode,
  saveSystemPrompt,
};
