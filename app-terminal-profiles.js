// Terminal profile catalog + config-derived profile helpers (500-line
// rule split).

import {
  BUILTIN_TERMINAL_PROFILES,
  DEFAULT_WORKBENCH_ASSETS_URL,
} from "./app-constants.js";
import {
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
} from "./app-normalize.js";
import { BASH_ENV, DEFAULT_CMD } from "./app-constants.js";
import { loadConfig, saveConfig } from "./app-workspace.js";

export function getTerminalProfiles(config = loadConfig()) {
  const shell = {
    ...BUILTIN_TERMINAL_PROFILES[0],
    program: config.cmd.split(/\s+/, 1)[0] || "bash",
    args: config.cmd.replace(/^\S+\s*/, ""),
    env: config.env,
    wd: "",
  };
  const configuredProfiles = new Map(
    config.terminalProfiles.map((profile) => [profile.id, profile]),
  );
  const builtinIds = new Set(
    BUILTIN_TERMINAL_PROFILES.map((profile) => profile.id),
  );
  const builtins = [shell, ...BUILTIN_TERMINAL_PROFILES.slice(1)].map((
    profile,
  ) => ({
    ...profile,
    ...configuredProfiles.get(profile.id),
    builtin: true,
  }));
  const profiles = [
    ...builtins,
    ...config.terminalProfiles.filter((profile) => !builtinIds.has(profile.id)),
  ];
  const order = normalizeTerminalProfileOrder(
    config.terminalProfileOrder,
    profiles,
  );
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...profiles].sort((left, right) =>
    positions.get(left.id) - positions.get(right.id)
  );
}

export function getDefaultTerminalProfile(config = loadConfig()) {
  return getTerminalProfiles(config).find((profile) =>
    profile.id === config.defaultTerminalProfileId
  ) ||
    getTerminalProfiles(config)[0];
}

export function getWorkbenchPanelConfig(config = loadConfig()) {
  return {
    assetsUrl: config.workbenchAssetsUrl || DEFAULT_WORKBENCH_ASSETS_URL,
  };
}

// The kernel execs the first whitespace token of cmd directly (the gojs
// driver readFile(args[0])), and the task image only ships bash/gear/w9y,
// so a compound cmd whose first token is another name (echo, ls, ...)
// dies with `open <token>: file does not exist`. Wrap those in `bash -c`
// so the full shell grammar is available; keep explicit paths (the caller
// said exactly what to exec) and the known image binaries untouched.
function wrapUnknownShellCmd(cmd) {
  const text = String(cmd || "").trim();
  if (!text) return cmd;
  const first = text.split(/\s+/)[0];
  if (first === "bash" || first === "gear" || first === "w9y") return cmd;
  // A path is exec'd directly: the kernel's LookPath resolves absolute and
  // relative paths alike, so a js worker (`examples/hello.js`) or wasi
  // module (`examples/hello.wasm`) must reach its driver, not bash. Bare
  // words still get wrapped so shell builtins and compound commands (e.g.
  // `echo hi; sleep 2`) keep working.
  if (first.includes("/")) return cmd;
  return `bash -c '${text.replace(/'/g, `'\''`)}'`;
}

export function terminalCommand(profile) {
  const cmd = profile.cmd ||
    [profile.program, profile.args].filter(Boolean).join(" ");
  return wrapUnknownShellCmd(cmd);
}

export function saveTerminalProfiles(profiles, defaultProfileId, profileOrder) {
  const config = loadConfig();
  const normalizedProfiles = profiles.map(normalizeTerminalProfile);
  const shell = normalizedProfiles.find((profile) => profile.id === "bash");
  saveConfig({
    ...config,
    terminalProfiles: normalizedProfiles,
    terminalProfileOrder: normalizeTerminalProfileOrder(
      profileOrder === undefined ? config.terminalProfileOrder : profileOrder,
      normalizedProfiles,
    ),
    defaultTerminalProfileId: defaultProfileId,
    ...(shell
      ? { cmd: terminalCommand(shell) || DEFAULT_CMD, env: shell.env }
      : {}),
  });
}

export function buildEnv(envText = loadConfig().env) {
  const env = { ...BASH_ENV };
  if (envText.trim()) {
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        const [key, ...rest] = trimmed.split("=");
        if (key) env[key] = rest.join("=");
      }
    }
  }
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ");
}

// --- Terminal ID counter ---
