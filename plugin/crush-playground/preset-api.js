// preset-api.js — host-side implementation of `config.crushRunner.*`,
// owned by the Crush Playground iframe plugin. The iframe page calls
// GearShell.config.crushRunner.{get,list,save,remove,setActive}; this
// module wires those handlers into the workspace shell config and
// owns the built-in preset list that ships with the app.
//
// Replaces the legacy `plugin/crush-runner/` facade (deleted when the
// entry-style Crush Runner panel was retired in favour of the iframe
// edition). The shell-side service layer
// (`crushRunnerConfigApi` + `crushRunnerSnapshot` /
// `saveCrushRunnerConfig`) lives here too, so the iframe page and
// the host stay in sync through a single module instead of three
// plugin directories.

import { loadConfig, saveConfig } from "../../app-workspace.js";
import { pushAuditEntry, pushEvent, redactSecrets } from "../../workspace-audit.js";
import {
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
} from "../../app-normalize.js";

// --- Built-in preset data ---

export const CRUSH_RUNNER_DEFAULT_PROFILE = {
  id: "crush",
  name: "Crush",
  program: "crush",
  args: "",
  type: "gojs",
  env: "",
  wd: "/opfs/home",
  icon: "bot",
};

// Default Crush config written to `${CRUSH_GLOBAL_CONFIG}/crushrc` on
// launch. Each panel instance gets its own directory so concurrent
// Crush sessions do not stomp on each other's provider/model defaults.
// Users can edit this freely in the UI; the Reset button restores the
// seeded values below. Line continuations (`\`) carry through to the
// file verbatim, so every `provider add` keeps its multi-line shape.
export const DEFAULT_CRUSHRC = [
  "option ui transparent false",
  "",
  // Use double quotes for the multi-line `provider add` entries so the
  // trailing line-continuation backslash does not escape the closing
  // quote. `${AGW}` stays a literal here because plain double-quoted
  // JS strings do not interpolate; crush will expand it at config-load.
  "provider add deepseek \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  "",
  "provider add stepfun \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1" \\',
  '  --api-key "-"',
  "",
  "provider add minimax-china \\",
  "  --type anthropic \\",
  '  --base-url "${AGW}/anthropic" \\',
  '  --api-key "-"',
  "",
  "model small deepseek/deepseek-v4-flash",
  "model large deepseek/deepseek-v4-flash",
  "model small stepfun/step-3.7-flash",
  "model large stepfun/step-3.7-flash",
  "model small minimax-china/MiniMax-M3",
  "model large minimax-china/MiniMax-M3",
  "",
].join("\n");

const CRUSHRC_OX = String.raw`option ui transparent false

provider add OpenRouter \
     --type openai-compat \
     --base-url "$AGW/api/v1" \
     --api-key "-" \
     --extra-header "Model" "stealth/ox-alpha"

model add OpenRouter/stealth/ox-alpha \
     --name "Stealth Ox Alpha" \
     --context-window 1000000 \
     --default-max-tokens 163840 \
     --can-reason true \
     --supports-images false

model large OpenRouter/stealth/ox-alpha --think
model small OpenRouter/stealth/ox-alpha --think`;

const CRUSHRC_MINIMAX = String.raw`option ui transparent false

provider add minimax-china \
  --type anthropic \
  --base-url "$AGW/anthropic" \
  --api-key "-"

model small minimax-china/MiniMax-M3
model large minimax-china/MiniMax-M3
`;

const CRUSHRC_DEEPSEEK = String.raw`option ui transparent false

provider add deepseek \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small deepseek/deepseek-v4-flash
model large deepseek/deepseek-v4-flash
`;

const CRUSHRC_STEPFUN = String.raw`option ui transparent false

provider add stepfun \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small stepfun/step-3.7-flash
model large stepfun/step-3.7-flash
`;

const CRUSHRC_ALL = String.raw`option ui transparent false

provider add deepseek \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

provider add stepfun \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

provider add minimax-china \
  --type anthropic \
  --base-url "$AGW/anthropic" \
  --api-key "-"

provider add OpenRouter \
     --type openai-compat \
     --base-url "$AGW/api/v1" \
     --api-key "-" \
     --extra-header "Model" "stealth/ox-alpha"

model add OpenRouter/stealth/ox-alpha \
     --name "Stealth Ox Alpha" \
     --context-window 1000000 \
     --default-max-tokens 163840 \
     --can-reason true \
     --supports-images false

model large OpenRouter/stealth/ox-alpha --think
model small OpenRouter/stealth/ox-alpha --think
model small deepseek/deepseek-v4-flash
model large deepseek/deepseek-v4-flash
model small stepfun/step-3.7-flash
model large stepfun/step-3.7-flash
model small minimax-china/MiniMax-M3
model large minimax-china/MiniMax-M3
`;

function builtinPreset(id, name, icon, crushrc) {
  return {
    id,
    name,
    icon,
    program: "/opfs/wanix/crush",
    args: "",
    type: "gojs",
    env: "",
    wd: "/opfs/home",
    builtin: true,
    crushrc,
  };
}

export function getBuiltinCrushRunnerPresets() {
  return [
    { ...CRUSH_RUNNER_DEFAULT_PROFILE, builtin: true },
    builtinPreset("ox", "Ox", "ghost", CRUSHRC_OX),
    builtinPreset("minimax", "MiniMax", "bot", CRUSHRC_MINIMAX),
    builtinPreset("deepseek", "DeepSeek", "fish", CRUSHRC_DEEPSEEK),
    builtinPreset("stepfun", "StepFun", "footprints", CRUSHRC_STEPFUN),
    builtinPreset("all", "All", "bot", CRUSHRC_ALL),
  ];
}

export const BUILTIN_CRUSH_RUNNER_PRESET_IDS = [
  "crush",
  "ox",
  "minimax",
  "deepseek",
  "stepfun",
  "all",
];
export const DEFAULT_CRUSH_RUNNER_ACTIVE_ID =
  BUILTIN_CRUSH_RUNNER_PRESET_IDS[0];

export function getCrushRunnerDefaults(preset = null) {
  if (!preset) return { ...CRUSH_RUNNER_DEFAULT_PROFILE };
  const { id: _id, builtin: _builtin, crushrc: _crushrc, ...rest } = preset;
  return { ...CRUSH_RUNNER_DEFAULT_PROFILE, ...rest };
}

export function getCrushRunnerCrushrcFor(preset = null) {
  if (!preset) return DEFAULT_CRUSHRC;
  return preset.crushrc || DEFAULT_CRUSHRC;
}

// --- Normalization + persistence (the preset CRUD layer) ---

export function normalizeCrushRunnerPreset(preset = {}) {
  const base = normalizeTerminalProfile(preset);
  return {
    ...base,
    crushrc: typeof preset.crushrc === "string" ? preset.crushrc : "",
    builtin: preset.builtin === true,
  };
}

export function getCrushRunnerPresets(config = loadConfig()) {
  // Build the live list of built-ins, then layer any user-saved
  // override with the matching id on top of each one. Empty-string
  // fields are treated as "user did not set this" so newly introduced
  // defaults (e.g. a new env= line on a builtin) reach existing
  // workspaces whose override still stores '' from before the field
  // existed. The legacy `crush` slot keeps merging into the first
  // builtin by id, so workspaces pinned to that id keep working.
  const builtins = getBuiltinCrushRunnerPresets().map((template) => {
    const merged = { ...template };
    const configured = (config.crushRunnerPresets || []).find((preset) =>
      preset.id === template.id
    );
    if (configured) {
      for (const [key, value] of Object.entries(configured)) {
        if (value === "" || value == null) continue;
        if (!(key in merged)) continue;
        merged[key] = value;
      }
    }
    merged.builtin = true;
    merged.id = template.id;
    return merged;
  });
  // Drop the user-saved entries that we just merged into the builtin
  // slots so we don't render the same preset twice.
  const customs = (config.crushRunnerPresets || []).filter(
    (preset) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(preset.id),
  );
  const all = [...builtins, ...customs];
  const order = normalizeTerminalProfileOrder(
    config.crushRunnerPresetOrder,
    all,
  );
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...all].sort((left, right) =>
    (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0)
  );
}

export function saveCrushRunnerPresets(presets, activeId, order) {
  const config = loadConfig();
  saveConfig({
    ...config,
    crushRunnerPresets: presets.map((preset) => ({
      ...preset,
      builtin: false,
    })),
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(order, presets),
    crushRunnerActiveId: typeof activeId === "string" && activeId
      ? activeId
      : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  });
}

// --- Iframe-facing config API (GearShell.config.crushRunner.*) ---

function auditOptions(input) {
  if (typeof input === "string") return { agent: input };
  return input || {};
}

function crushRunnerSnapshot(config = loadConfig()) {
  return {
    presets: getCrushRunnerPresets(config),
    activeId: config.crushRunnerActiveId,
    order: config.crushRunnerPresetOrder,
  };
}

function saveCrushRunnerConfig(presets, activeId, order, agentOrOptions = {}) {
  if (!Array.isArray(presets)) throw new Error("presets must be an array");
  const prev = loadConfig();
  const normalized = presets.map(normalizeCrushRunnerPreset);
  const nextOrder = Array.isArray(order) ? order : normalized.map((preset) => preset.id);
  saveCrushRunnerPresets(normalized, activeId, nextOrder);
  const saved = loadConfig();
  pushAuditEntry({ prev, next: saved, agent: auditOptions(agentOrOptions).agent });
  pushEvent("config.changed", { result: redactSecrets(saved) });
  return crushRunnerSnapshot(saved);
}

function saveCrushRunnerPreset(preset, options = {}) {
  const current = loadConfig();
  const normalized = normalizeCrushRunnerPreset(preset);
  if (!normalized.id || !normalized.program) {
    throw new Error("preset requires an id and program");
  }
  const presets = (current.crushRunnerPresets || []).filter((item) =>
    item.id !== normalized.id
  );
  presets.push(normalized);
  const activeId = options.active === true
    ? normalized.id
    : current.crushRunnerActiveId;
  return saveCrushRunnerConfig(
    presets,
    activeId,
    current.crushRunnerPresetOrder,
    options,
  );
}

function setCrushRunnerActive(id, agentOrOptions = {}) {
  const current = loadConfig();
  const presets = getCrushRunnerPresets(current);
  if (!presets.some((preset) => preset.id === id)) {
    throw new Error(`crush runner preset "${id}" not found`);
  }
  return saveCrushRunnerConfig(
    current.crushRunnerPresets,
    id,
    current.crushRunnerPresetOrder,
    agentOrOptions,
  );
}

function removeCrushRunnerPreset(id, agentOrOptions = {}) {
  const current = loadConfig();
  const preset = getCrushRunnerPresets(current).find((item) => item.id === id);
  if (!preset) throw new Error(`crush runner preset "${id}" not found`);
  if (preset.builtin) throw new Error("built-in crush runner presets cannot be removed");
  const presets = (current.crushRunnerPresets || []).filter((item) =>
    item.id !== id
  );
  const activeId = current.crushRunnerActiveId === id
    ? undefined
    : current.crushRunnerActiveId;
  return saveCrushRunnerConfig(
    presets,
    activeId,
    current.crushRunnerPresetOrder,
    agentOrOptions,
  );
}

export const crushRunnerConfigApi = {
  get: () => crushRunnerSnapshot(),
  list: () => crushRunnerSnapshot().presets,
  save: saveCrushRunnerPreset,
  remove: removeCrushRunnerPreset,
  setActive: setCrushRunnerActive,
};