// Normalizers and validators for config / workspaces / presets / binds /
// tasks (500-line rule split). Pure functions.

import {
  BUILTIN_TERMINAL_PROFILES,
  CANONICAL_LUCIDE_ICON_IDS,
  CONFIG_KEY,
  DEFAULT_CMD,
  DEFAULT_COLLAPSED_LAUNCHER_ITEMS,
  DEFAULT_CONFIG,
  DEFAULT_HUSH_BINARY_URL,
  DEFAULT_LAUNCHER_ITEM_ORDER,
  DEFAULT_PLUGINS,
  DEFAULT_VM_BACKEND_URL,
  DEFAULT_VM_LINUX_URL,
  DEFAULT_WORKBENCH_ASSETS_URL,
  HOME,
  isLegacyHushBinaryUrl,
  LAUNCHER_COLLAPSIBLE_PANEL_TYPES,
  LEGACY_DEFAULT_CMD,
  LEGACY_DEFAULT_WORKBENCH_ASSETS_URL,
  lucideIconId,
  lucideIconLabel,
  STARTUP_PANEL_TYPES,
  SUPPORTED_TASK_TYPES,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
  WANIX,
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_TASK_STATUS_EVENT,
} from "./app-constants.js?v=20260828.35";
import {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
} from "./crush-runner.js?v=20260826.71";
import {
  getCrushRunnerPresets,
  normalizeCrushRunnerPreset,
} from "./app-workspace.js?v=20260826.76";
import { createWorkspaceId } from "./app-storage.js?v=20260826.33";
import {
  clone,
  isLegacySystemMirrorBind,
  LEGACY_RAMFS_MOUNT_IDS,
  LEGACY_SYSTEM_MIRROR_BINDS,
  normalizeBind,
  normalizeSystemBind,
  normalizeSystemConfig,
  normalizeTask,
  validateBind,
  validateTask,
} from "./app-normalize-system.js?v=20260828.27";
export {
  clone,
  isLegacySystemMirrorBind,
  LEGACY_RAMFS_MOUNT_IDS,
  LEGACY_SYSTEM_MIRROR_BINDS,
  normalizeBind,
  normalizeSystemBind,
  normalizeSystemConfig,
  normalizeTask,
  validateBind,
  validateTask,
} from "./app-normalize-system.js?v=20260828.27";

export function normalizePresetDescription(description) {
  return typeof description === "string" ? description.trim() : "";
}

export function normalizeCustomWorkspacePreset(preset = {}) {
  const template = preset.template && typeof preset.template === "object"
    ? preset.template
    : preset;
  return {
    id: typeof preset.id === "string" && preset.id
      ? preset.id
      : `custom-${createWorkspaceId()}`,
    name: normalizeWorkspaceName(preset.name) || "Untitled preset",
    description: normalizePresetDescription(preset.description),
    createdAt: typeof preset.createdAt === "string"
      ? preset.createdAt
      : new Date().toISOString(),
    updatedAt: typeof preset.updatedAt === "string"
      ? preset.updatedAt
      : new Date().toISOString(),
    runtime: normalizeRuntimeConfig(template.runtime),
    system: normalizeSystemConfig(template.system),
    binds: Array.isArray(template.binds)
      ? template.binds.map(normalizeBind)
      : [],
    tasks: Array.isArray(template.tasks)
      ? template.tasks.map(normalizeTask)
      : [],
    shell: normalizeShellConfig(template.shell),
  };
}

// Only v<semver> tags are supported for the Wanix runtime. Workspaces
// that still pin the module to a commit hash or @main, or the wasm to
// v0.4.0 (which predates the multiline-argv kernel), are migrated to
// the current default; any other semver-pinned URL is an intentional
// override and stays as-is.
const WANIX_RUNTIME_SEMVER = /^v\d+\.\d+\.\d+/;
const LEGACY_WANIX_KERNEL_WASM = "v0.4.0";
// Local-directory mounting needs the "localdir" bind type added in v0.4.11;
// workspaces saved against older pins hit an unknown-type rejection instead.
const MIN_LOCALDIR_RUNTIME = [0, 4, 11];

function semverParts(ref) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(ref);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isOlderThan(ref, min) {
  const parts = semverParts(ref);
  if (!parts) return false;
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== min[i]) return parts[i] < min[i];
  }
  return false;
}

export function isLegacyWanixRuntimeUrl(url, kind) {
  if (typeof url !== "string" || !url.includes("justwasm/wanix")) {
    return false;
  }
  const ref = url.slice(url.lastIndexOf("@") + 1);
  if (WANIX_RUNTIME_SEMVER.test(ref)) {
    return kind === "wasm" &&
      (ref === LEGACY_WANIX_KERNEL_WASM ||
        isOlderThan(ref, MIN_LOCALDIR_RUNTIME));
  }
  return true; // commit hashes, @main, or any other floating ref
}

export function normalizeRuntimeConfig(runtime = {}) {
  const configured = runtime && typeof runtime === "object" ? runtime : {};
  const wasmUrl = isLegacyWanixRuntimeUrl(configured.wasmUrl, "wasm")
    ? WANIX_RUNTIME.wasmUrl
    : configured.wasmUrl;
  const moduleUrl = isLegacyWanixRuntimeUrl(configured.moduleUrl, "module")
    ? WANIX_RUNTIME.moduleUrl
    : configured.moduleUrl;
  return {
    ...WANIX_RUNTIME,
    ...configured,
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(moduleUrl ? { moduleUrl } : {}),
  };
}

function normalizeStartupPanels(config) {
  return Array.isArray(config?.startupPanels)
    ? [
      ...new Set(config.startupPanels.filter((panel) =>
        STARTUP_PANEL_TYPES.includes(panel)
      )),
    ]
    : [];
}

function normalizeFavorites(config) {
  return Array.isArray(config?.favorites)
    ? config.favorites.filter(
      (favorite) =>
        favorite &&
        typeof favorite === "object" &&
        typeof favorite.path === "string" &&
        typeof favorite.label === "string",
    )
    : undefined;
}

function normalizeCollapsedLauncherItems(config) {
  return Array.isArray(config?.collapsedLauncherItems)
    ? [
      ...new Set(config.collapsedLauncherItems.filter((component) =>
        LAUNCHER_COLLAPSIBLE_PANEL_TYPES.includes(component)
      )),
    ]
    : [...DEFAULT_COLLAPSED_LAUNCHER_ITEMS];
}

function normalizeDefaultTerminalProfileId(config) {
  if (config?.defaultTerminalProfileId === "hush") return "bash";
  return typeof config?.defaultTerminalProfileId === "string"
    ? config.defaultTerminalProfileId
    : "bash";
}

function normalizeProfileLists(config) {
  return {
    terminalProfiles: Array.isArray(config?.terminalProfiles)
      ? config.terminalProfiles.map(normalizeTerminalProfile).map(
        migrateLegacyHushTerminalProfile,
      ).filter((profile) => profile.program)
      : [],
    crushRunnerPresets: Array.isArray(config?.crushRunnerPresets)
      ? config.crushRunnerPresets.map(normalizeCrushRunnerPreset).filter((
        preset,
      ) => preset.program)
      : [],
  };
}

// Model providers for the AI features (WISHLIST #1): a de-duplicated
// list of {id, name, baseURL, apiKey, models, enabled}. The raw apiKey
// stays in the shell config; every agent-facing read path redacts it.
export function normalizeProviders(providers) {
  if (!Array.isArray(providers)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of providers) {
    const provider = raw && typeof raw === "object" ? raw : {};
    const id = String(provider.id || provider.name || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(provider.name || id).trim(),
      baseURL: String(provider.baseURL || "").trim(),
      apiKey: typeof provider.apiKey === "string" ? provider.apiKey : "",
      models: normalizeProviderModels(provider.models),
      enabled: provider.enabled !== false,
    });
  }
  return out;
}

function normalizeProviderModels(models) {
  if (Array.isArray(models)) {
    return models.map((model) => String(model)).filter(Boolean);
  }
  if (typeof models === "string" && models.trim()) {
    return models.split(/[\n,]+/).map((model) => model.trim()).filter(Boolean);
  }
  return [];
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item)).filter(Boolean);
}

// Plugin manifests (WISHLIST #9): { id, name, version, icon, entry,
// enabled, permissions: { api, origins } }. entry is an http(s) URL, a
// /same-origin path, or a vfs:/... path (see plugins.js).
export function normalizePlugin(plugin = {}) {
  const id = String(plugin.id || "").trim();
  if (!id) return null;
  const iframe = plugin?.iframe;
  const iframeSrc = String(iframe?.src || "").trim();
  return {
    id,
    name: String(plugin.name || id).trim(),
    version: String(plugin.version || "1.0.0").trim(),
    icon: String(plugin.icon || "Wrench").trim(),
    entry: String(plugin.entry || "").trim(),
    enabled: plugin.enabled !== false,
    permissions: {
      api: normalizeStringList(plugin.permissions?.api),
      origins: normalizeStringList(plugin.permissions?.origins),
    },
    ...(iframeSrc
      ? {
        iframe: {
          src: iframeSrc,
          ...(iframe.allow ? { allow: String(iframe.allow).trim() } : {}),
          ...(iframe.allowFullscreen ? { allowFullscreen: true } : {}),
        },
      }
      : {}),
  };
}

// User config wins by id; built-in defaults fill in the rest, so a
// saved workspace that predates the plugin kernel still boots Music.
export function normalizePlugins(list, defaults) {
  const user = (Array.isArray(list) ? list : [])
    .map(normalizePlugin)
    .filter(Boolean);
  const userIds = new Set(user.map((item) => item.id));
  const fallback = (Array.isArray(defaults) ? defaults : [])
    .map(normalizePlugin)
    .filter((item) => item && !userIds.has(item.id));
  return [...user, ...fallback];
}

export function normalizeShellConfig(config) {
  const { terminalProfiles, crushRunnerPresets } = normalizeProfileLists(
    config,
  );
  const normalized = {
    cmd: typeof config?.cmd === "string" && config.cmd.trim()
      ? config.cmd.trim()
      : DEFAULT_CMD,
    env: typeof config?.env === "string" ? config.env : "",
    startupPanels: normalizeStartupPanels(config),
    restoreTabs: config?.restoreTabs === true,
    allowBackgroundPlayback: config?.allowBackgroundPlayback !== false,
    workbenchAssetsUrl: normalizeWorkbenchAssetsUrl(config?.workbenchAssetsUrl),
    vmBackendUrl: normalizeVmBackendUrl(config?.vmBackendUrl),
    vmLinuxUrl: normalizeIntegrationUrl(
      config?.vmLinuxUrl,
      DEFAULT_VM_LINUX_URL,
    ),
    vmMemory: normalizeVmMemory(config?.vmMemory),
    vmNetworkMode: normalizeVmNetworkMode(config?.vmNetworkMode),
    vmWispUrl: normalizeVmWispUrl(config?.vmWispUrl),
    wagiDogEnabled: config?.wagiDogEnabled === true,
    widgetbot: config?.widgetbot === true,
    providers: normalizeProviders(config?.providers),
    plugins: normalizePlugins(config?.plugins, DEFAULT_PLUGINS),
    favorites: normalizeFavorites(config),
    collapsedLauncherItems: normalizeCollapsedLauncherItems(config),
    launcherOrder: normalizeLauncherOrder(config?.launcherOrder),
    pinnedLauncherItems: normalizePinnedLauncherItems(
      config?.pinnedLauncherItems,
    ),
    terminalProfiles,
    terminalProfileOrder: normalizeTerminalProfileOrder(
      config?.terminalProfileOrder,
      terminalProfiles,
    ),
    defaultTerminalProfileId: normalizeDefaultTerminalProfileId(config),
    crushRunnerPresets,
    crushRunnerPresetOrder: normalizeTerminalProfileOrder(
      config?.crushRunnerPresetOrder,
      crushRunnerPresets,
    ),
    crushRunnerActiveId: typeof config?.crushRunnerActiveId === "string"
      ? config.crushRunnerActiveId
      : DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
  };
  return remapLegacyShellCommand(normalized);
}

// The shell used to be mounted as `hush`, and the rc file used to live at
// /profile; remap persisted commands (legacy hush + older /profile) to the
// current bash default (rc file at /preset/profile) so saved configs keep
// working unchanged.
function remapLegacyShellCommand(normalized) {
  if (
    normalized.cmd === LEGACY_DEFAULT_CMD ||
    normalized.cmd === "hush -rcfile /profile" ||
    normalized.cmd === "bash -rcfile /profile"
  ) normalized.cmd = DEFAULT_CMD;
  return normalized;
}

// Built-in Crush Runner presets ship in crush-runner.js; getCrushRunnerPresets

export function getActiveCrushRunnerPreset(config = loadConfig()) {
  const presets = getCrushRunnerPresets(config);
  return presets.find((preset) =>
    preset.id === (config.crushRunnerActiveId || DEFAULT_CRUSH_RUNNER_ACTIVE_ID)
  ) ||
    presets[0];
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

export function blankCrushRunnerPresetDraft() {
  return {
    name: "",
    icon: "bot",
    program: "crush",
    args: "",
    type: "gojs",
    wd: "",
    env: "",
    crushrc: "",
  };
}

export function normalizeTerminalProfileOrder(order, profiles = []) {
  const knownIds = [
    ...BUILTIN_TERMINAL_PROFILES.map((profile) => profile.id),
    ...BUILTIN_CRUSH_RUNNER_PRESET_IDS,
    ...profiles.map((profile) => profile.id),
  ];
  const known = new Set(knownIds);
  const requested = Array.isArray(order) ? order : [];
  const unique = [...new Set(requested.filter((id) => known.has(id)))];
  return [...unique, ...knownIds.filter((id) => !unique.includes(id))];
}

export function normalizeLauncherOrder(order) {
  const requested = Array.isArray(order) ? order : [];
  const known = new Set(DEFAULT_LAUNCHER_ITEM_ORDER);
  const unique = [
    ...new Set(requested.filter((component) => known.has(component))),
  ];
  return [
    ...unique,
    ...DEFAULT_LAUNCHER_ITEM_ORDER.filter((component) =>
      !unique.includes(component)
    ),
  ];
}

// Launcher favorites: component names pinned to the top of the launcher
// grid (launcher.js renders them first and never collapses them). Unknown
// components are dropped so stale config cannot break the ordering.
export function normalizePinnedLauncherItems(items) {
  const known = new Set(DEFAULT_LAUNCHER_ITEM_ORDER);
  return [
    ...new Set(
      Array.isArray(items)
        ? items.filter((component) => known.has(component))
        : [],
    ),
  ];
}

export function normalizeIntegrationUrl(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().replace(/\/+$/, "");
}

export function normalizeWorkbenchAssetsUrl(value) {
  const normalized = normalizeIntegrationUrl(
    value,
    DEFAULT_WORKBENCH_ASSETS_URL,
  );
  // This was GearShell's former default. Migrate it to the bundled submodule;
  // any other value remains an intentional workspace-local override.
  return normalized === LEGACY_DEFAULT_WORKBENCH_ASSETS_URL
    ? DEFAULT_WORKBENCH_ASSETS_URL
    : normalized;
}

export function normalizeVmBackendUrl(value) {
  const normalized = normalizeIntegrationUrl(value, DEFAULT_VM_BACKEND_URL);
  // The temporary custom archive was pinned to a wanix-extras commit
  // hash; only the semver-pinned public archive is supported going
  // forward, so restore workspaces that inherited the commit-pinned one.
  return isLegacyVmBackendUrl(normalized) ? DEFAULT_VM_BACKEND_URL : normalized;
}

function isLegacyVmBackendUrl(url) {
  return typeof url === "string" &&
    url.includes("wanix-extras@") &&
    /@[0-9a-f]{7,}\/v86\.tgz$/.test(url);
}

export function normalizeVmMemory(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^\d+(?:[KMG])?$/i.test(normalized)
    ? normalized.toUpperCase()
    : "512M";
}

export function normalizeVmNetworkMode(value) {
  return ["none", "fetch", "wisp"].includes(value) ? value : "none";
}

export function normalizeVmWispUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  try {
    const { protocol } = new URL(normalized);
    return ["wisp:", "wisps:"].includes(protocol) ? normalized : "";
  } catch {
    return "";
  }
}

export function normalizeTerminalProfile(profile = {}) {
  const defaultIcon = profile.id === "crush" ? "bot" : "terminal";
  return {
    id: typeof profile.id === "string" && profile.id
      ? profile.id
      : createWorkspaceId(),
    name: typeof profile.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : "Terminal",
    program: typeof profile.program === "string" ? profile.program.trim() : "",
    args: typeof profile.args === "string" ? profile.args.trim() : "",
    type: SUPPORTED_TASK_TYPES.includes(profile.type) ? profile.type : "gojs",
    env: typeof profile.env === "string" ? profile.env : "",
    wd: typeof profile.wd === "string" ? profile.wd.trim() : "",
    icon: TERMINAL_PRESET_ICON_BY_ID[profile.icon] ? profile.icon : defaultIcon,
  };
}

export function getTerminalPresetIcon(profile) {
  return TERMINAL_PRESET_ICON_BY_ID[profile?.icon]?.icon || Terminal;
}

export function migrateLegacyHushTerminalProfile(profile) {
  // The shell mount was renamed hush → bash; rewrite persisted profiles
  // that still carry the old id / program / legacy rcfile path so they
  // keep mapping onto the built-in Bash profile.
  const id = profile.id === "hush" ? "bash" : profile.id;
  const name = profile.id === "hush" && profile.name === "Hush"
    ? "Bash"
    : profile.name;
  const program = profile.program === "hush" ? "bash" : profile.program;
  // The rc file moved to the per-task /preset mount (preset/profile);
  // rewrite both the legacy hush path and the older /profile location.
  const args = profile.args === "-rcfile /tmp/profile" ||
      profile.args === "-rcfile /profile"
    ? "-rcfile /preset/profile"
    : profile.args;
  if (
    id === profile.id && name === profile.name &&
    program === profile.program && args === profile.args
  ) {
    return profile;
  }
  return { ...profile, id, name, program, args };
}
