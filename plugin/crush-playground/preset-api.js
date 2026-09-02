// preset-api.js — built-in Crush Playground presets + the boot
// hook that seeds them into the generic per-workspace
// `config.kv` store under `crush-playground:builtins`.
//
// The Playground iframe reads those keys through the same
// `GearShell.config.kv` API any plugin can opt into (see
// plugin/playground/playground-catalog-shell.js for the method
// catalog). This module owns the static preset data and the
// initial KV seed; runtime read/write goes straight through the
// iframe, no host-side facade.

import { loadConfig, saveConfig } from "../../app-workspace.js";
import { kvGet } from "./kv-api.js";

export const CRUSH_BUILTINS_KV_KEY = "crush-playground:builtins";
export const CRUSH_STATE_KV_KEY = "crush-playground:state";

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
  "provider add deepseek \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1"\\',
  '  --api-key "-"',
  "",
  "provider add stepfun \\",
  "  --type openai-compat \\",
  '  --base-url "${AGW}/v1"\\',
  '  --api-key "-"',
  "",
  "provider add minimax-china \\",
  "  --type anthropic \\",
  '  --base-url "${AGW}/anthropic"\\',
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

// Seed the read-only builtins key once per workspace, so the
// Playground iframe can read them through `config.kv.get(...)`
// like any other JSON value.
export function ensureCrushRunnerBuiltinsKv() {
  if (kvGet(CRUSH_BUILTINS_KV_KEY)) return;
  const config = loadConfig();
  const kv = { ...(config.kv || {}) };
  kv[CRUSH_BUILTINS_KV_KEY] = getBuiltinCrushRunnerPresets();
  saveConfig({ ...config, kv });
}