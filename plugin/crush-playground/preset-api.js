// preset-api.js — host-side implementation of `config.crushRunner.*`,
// owned by the Crush Playground iframe plugin. The iframe page calls
// GearShell.config.crushRunner.{get,list,save,remove,setActive}; this
// module wires those handlers into the generic config.kv namespace
// (see ./kv-api.js) and owns the built-in preset list that ships
// with the app.
//
// Replaces the legacy `plugin/crush-runner/` facade (deleted when the
// entry-style Crush Runner panel was retired in favour of the iframe
// edition). The shell-side service layer (`crushRunnerConfigApi`)
// stays put so the iframe page didn't need rewriting when storage
// moved onto config.kv.

import { loadConfig, saveConfig } from "../../app-workspace.js";
import { normalizeTerminalProfile } from "../../app-normalize.js";
import { kvGet, kvSet } from "./kv-api.js";

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

// Read the Crush Playground state from KV: the user-saved customs +
// activeId + order. Builtins are not stored here — they ship with the
// app and the iframe reads them from `crush-playground:builtins` and
// merges on its side.
export function getCrushRunnerPresets() {
  const kv = loadConfig().kv || {};
  return kv["crush-playground:state"] || {
    customs: [],
    activeId: undefined,
    order: [],
  };
}

// Built-in presets ship on a separate, read-only KV key. The host
// seeds it once per workspace (the iframe treats it as static
// throughout the session — builtins are code, not user data).
export const CRUSH_BUILTINS_KV_KEY = "crush-playground:builtins";
export const CRUSH_STATE_KV_KEY = "crush-playground:state";

export function ensureCrushRunnerBuiltinsKv() {
  const config = loadConfig();
  const kv = { ...(config.kv || {}) };
  if (!kv[CRUSH_BUILTINS_KV_KEY]) {
    kv[CRUSH_BUILTINS_KV_KEY] = getBuiltinCrushRunnerPresets();
    saveConfig({ ...config, kv });
  }
}

export function saveCrushRunnerPresets(presets, activeId, order) {
  const config = loadConfig();
  const customs = presets
    .filter((preset) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(preset.id))
    .map((preset) => ({ ...preset, builtin: false }));
  const kv = { ...(config.kv || {}) };
  kv[CRUSH_STATE_KV_KEY] = {
    customs,
    activeId: typeof activeId === "string" && activeId
      ? activeId
      : undefined,
    order: Array.isArray(order) ? order.slice() : customs.map((preset) => preset.id),
  };
  saveConfig({ ...config, kv });
}

// --- Iframe-facing config API (GearShell.config.kv.* under the hood) ---
// The Crush Playground iframe keeps talking to its old
// `GearShell.config.crushRunner.*` shape (get / save / remove /
// setActive / list) so the page rewrite is minimal. Each handler
// reads / writes the `crush-playground:state` and `:builtins` keys
// through the host-side kv module.

function crushRunnerSnapshot() {
  const state = (kvGet(CRUSH_STATE_KV_KEY) || {});
  const builtins = kvGet(CRUSH_BUILTINS_KV_KEY) || [];
  const customs = Array.isArray(state.customs) ? state.customs : [];
  const all = [...builtins, ...customs];
  const order = Array.isArray(state.order) && state.order.length > 0
    ? state.order
    : all.map((preset) => preset.id);
  const positions = new Map(order.map((id, index) => [id, index]));
  const merged = [...all].sort((left, right) =>
    (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0)
  );
  return {
    presets: merged,
    activeId: state.activeId,
    order,
  };
}

function auditAgent(input) {
  if (typeof input === "string") return input;
  return input && typeof input === "object" ? input.agent : undefined;
}

function writeCrushRunnerState(state, agentOrOptions) {
  const agent = auditAgent(agentOrOptions);
  const result = kvSet(CRUSH_STATE_KV_KEY, state, agent ? { agent } : {});
  return { ok: true, ...result };
}

function saveCrushRunnerPreset(preset, options = {}) {
  const normalized = normalizeCrushRunnerPreset(preset);
  if (!normalized.id || !normalized.program) {
    throw new Error("preset requires an id and program");
  }
  const snapshot = crushRunnerSnapshot();
  const customs = snapshot.presets
    .filter((item) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(item.id))
    .filter((item) => item.id !== normalized.id);
  customs.push(normalized);
  const nextState = {
    customs,
    activeId: options.active === true
      ? normalized.id
      : snapshot.activeId,
    order: snapshot.order,
  };
  writeCrushRunnerState(nextState, options);
  return crushRunnerSnapshot();
}

function setCrushRunnerActive(id, agentOrOptions = {}) {
  const snapshot = crushRunnerSnapshot();
  if (!snapshot.presets.some((preset) => preset.id === id)) {
    throw new Error(`crush runner preset "${id}" not found`);
  }
  const nextState = {
    customs: snapshot.presets
      .filter((preset) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(preset.id)),
    activeId: id,
    order: snapshot.order,
  };
  writeCrushRunnerState(nextState, agentOrOptions);
  return crushRunnerSnapshot();
}

function removeCrushRunnerPreset(id, agentOrOptions = {}) {
  const snapshot = crushRunnerSnapshot();
  const target = snapshot.presets.find((item) => item.id === id);
  if (!target) throw new Error(`crush runner preset "${id}" not found`);
  if (target.builtin) throw new Error("built-in crush runner presets cannot be removed");
  const customs = snapshot.presets
    .filter((preset) => !BUILTIN_CRUSH_RUNNER_PRESET_IDS.includes(preset.id))
    .filter((item) => item.id !== id);
  const nextState = {
    customs,
    activeId: snapshot.activeId === id ? undefined : snapshot.activeId,
    order: snapshot.order,
  };
  writeCrushRunnerState(nextState, agentOrOptions);
  return crushRunnerSnapshot();
}

export const crushRunnerConfigApi = {
  get: () => crushRunnerSnapshot(),
  list: () => crushRunnerSnapshot().presets,
  save: saveCrushRunnerPreset,
  remove: removeCrushRunnerPreset,
  setActive: setCrushRunnerActive,
};