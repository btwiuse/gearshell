// Crush Runner default profile, default crushrc, and the built-in presets
// that ship with the app. All pure data plus the small resolvers that pick
// a starting point from a preset; the interactive panel logic lives in
// crush-panel*.js and the launch plumbing in crush-config.js.

import { crushRunnerDep } from "./crush-deps.js?v=20260825.1";

export const CRUSH_RUNNER_DEFAULT_PROFILE = {
  id: "crush",
  name: "Crush",
  program: "crush",
  args: "",
  type: "gojs",
  env: "",
  // Default working directory. The HOME bind (`/opfs/home`) is injected via
  // initCrushRunner, so resolve it lazily: spreading the profile at module
  // load would throw because deps are wired later. getCrushRunnerDefaults
  // snapshots the current HOME into a concrete string whenever the form or
  // a preset switch needs a starting point.
  get wd() {
    return crushRunnerDep("HOME");
  },
  icon: "bot",
};

// Default Crush config written to `${CRUSH_GLOBAL_CONFIG}/crushrc` on
// launch. Each panel instance gets its own directory so concurrent Crush
// sessions do not stomp on each other's provider/model defaults. Users
// can edit this freely in the UI; the Reset button restores the seeded
// values below. Line continuations (`\`) carry through to the file
// verbatim, so every `provider add` keeps its multi-line shape.
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

// Built-in Crush Runner presets. These ship with the app and are always
// available alongside the user's saved customs; the order below is also
// the fallback render order when a workspace has no saved
// crushRunnerPresetOrder yet. The first entry (`crush`) keeps the
// legacy default id so existing workspaces that pinned
// crushRunnerActiveId === 'crush' keep resolving.
// Built at call time because the default profile resolves wd lazily from
// the HOME dependency, which initCrushRunner wires after module load.
export function getBuiltinCrushRunnerPresets() {
  return [
    { ...CRUSH_RUNNER_DEFAULT_PROFILE, builtin: true },
    {
      id: "ox",
      name: "Ox",
      icon: "ghost",
      program: "/opfs/wanix/crush",
      args: "",
      type: "gojs",
      env: "",
      wd: crushRunnerDep("HOME"),
      builtin: true,
      crushrc: String.raw`option ui transparent false

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
model small OpenRouter/stealth/ox-alpha --think`,
    },
    {
      id: "minimax",
      name: "MiniMax",
      icon: "bot",
      program: "/opfs/wanix/crush",
      args: "",
      type: "gojs",
      env: "",
      wd: crushRunnerDep("HOME"),
      builtin: true,
      crushrc: String.raw`option ui transparent false

provider add minimax-china \
  --type anthropic \
  --base-url "$AGW/anthropic" \
  --api-key "-"

model small minimax-china/MiniMax-M3
model large minimax-china/MiniMax-M3
`,
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      icon: "fish",
      program: "/opfs/wanix/crush",
      args: "",
      type: "gojs",
      env: "",
      wd: crushRunnerDep("HOME"),
      builtin: true,
      crushrc: String.raw`option ui transparent false

provider add deepseek \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small deepseek/deepseek-v4-flash
model large deepseek/deepseek-v4-flash
`,
    },
    {
      id: "stepfun",
      name: "StepFun",
      icon: "footprints",
      program: "/opfs/wanix/crush",
      args: "",
      type: "gojs",
      env: "",
      wd: crushRunnerDep("HOME"),
      builtin: true,
      crushrc: String.raw`option ui transparent false

provider add stepfun \
  --type openai-compat \
  --base-url "$AGW/v1" \
  --api-key "-"

model small stepfun/step-3.7-flash
model large stepfun/step-3.7-flash
`,
    },
    {
      id: "all",
      name: "All",
      icon: "bot",
      program: "/opfs/wanix/crush",
      args: "",
      type: "gojs",
      env: "",
      wd: crushRunnerDep("HOME"),
      builtin: true,
      crushrc: String.raw`option ui transparent false

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
`,
    },
  ];
}

export const BUILTIN_CRUSH_RUNNER_PRESET_IDS = ["crush", "ox", "minimax", "deepseek", "stepfun", "all"];
export const DEFAULT_CRUSH_RUNNER_ACTIVE_ID = BUILTIN_CRUSH_RUNNER_PRESET_IDS[0];

export function getCrushRunnerDefaults(preset = null) {
  // Built-in defaults win; if a preset is supplied (active or seeded),
  // surface it as the starting point so this panel reflects whichever
  // Crush configuration the user has chosen to edit.
  if (!preset) return { ...CRUSH_RUNNER_DEFAULT_PROFILE };
  const { id: _id, builtin: _builtin, crushrc: _crushrc, ...rest } = preset;
  return { ...CRUSH_RUNNER_DEFAULT_PROFILE, ...rest };
}

export function getCrushRunnerCrushrcFor(preset = null) {
  if (!preset) return DEFAULT_CRUSHRC;
  return preset.crushrc || DEFAULT_CRUSHRC;
}
