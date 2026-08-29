// Terminal profile catalog + config-derived profile helpers (500-line
// rule split).

import {
  BUILTIN_TERMINAL_PROFILES,
  DEFAULT_VM_BACKEND_URL,
  DEFAULT_VM_LINUX_URL,
  DEFAULT_WORKBENCH_ASSETS_URL,
} from "./app-constants.js?v=20260828.67";
import {
  normalizeTerminalProfile,
  normalizeTerminalProfileOrder,
  normalizeVmNetworkMode,
  normalizeVmWispUrl,
} from "./app-normalize.js?v=20260828.109";
import { BASH_ENV, DEFAULT_CMD } from "./app-constants.js?v=20260828.67";
import { loadConfig, saveConfig } from "./app-workspace.js?v=20260826.108";

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

export function getVmPanelConfig(config = loadConfig()) {
  const networkMode = normalizeVmNetworkMode(config.vmNetworkMode);
  const wispUrl = normalizeVmWispUrl(config.vmWispUrl);
  return {
    backendUrl: config.vmBackendUrl || DEFAULT_VM_BACKEND_URL,
    linuxUrl: config.vmLinuxUrl || DEFAULT_VM_LINUX_URL,
    memory: config.vmMemory || "512M",
    netdev: networkMode === "fetch"
      ? "user,type=virtio,relay_url=fetch"
      : networkMode === "wisp" && wispUrl
      ? `user,type=virtio,relay_url=${wispUrl}`
      : "",
  };
}

export function terminalCommand(profile) {
  return profile.cmd ||
    [profile.program, profile.args].filter(Boolean).join(" ");
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
