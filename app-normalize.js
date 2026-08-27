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
  DEFAULT_SYSTEM_CONFIG,
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
  SUPPORTED_BIND_TYPES,
  SUPPORTED_SYSTEM_BIND_TYPES,
  SUPPORTED_TASK_TYPES,
  SUPPORTED_UNION_MODES,
  TERMINAL_PRESET_ICON_BY_ID,
  TERMINAL_PRESET_ICON_OPTIONS,
  WANIX,
  WANIX_RUNTIME,
  WORKSPACE_CHANGED_EVENT,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_TASK_STATUS_EVENT,
} from "./app-constants.js?v=20260828.4";
import {
  BUILTIN_CRUSH_RUNNER_PRESET_IDS,
  DEFAULT_CRUSH_RUNNER_ACTIVE_ID,
} from "./crush-runner.js?v=20260826.2";
import {
  getCrushRunnerPresets,
  normalizeCrushRunnerPreset,
} from "./app-workspace.js?v=20260826.2";
import { createWorkspaceId } from "./app-storage.js?v=20260826.2";

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

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

export function normalizeShellConfig(config) {
  const terminalProfiles = Array.isArray(config?.terminalProfiles)
    ? config.terminalProfiles.map(normalizeTerminalProfile).map(
      migrateLegacyHushTerminalProfile,
    ).filter((profile) => profile.program)
    : [];
  const crushRunnerPresets = Array.isArray(config?.crushRunnerPresets)
    ? config.crushRunnerPresets.map(normalizeCrushRunnerPreset).filter((
      preset,
    ) => preset.program)
    : [];
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
    favorites: normalizeFavorites(config),
    collapsedLauncherItems: normalizeCollapsedLauncherItems(config),
    launcherOrder: normalizeLauncherOrder(config?.launcherOrder),
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
  // The shell used to be mounted as `hush`; remap any persisted hush
  // command (both the current and the older legacy default) to the bash
  // mount so saved configs keep working unchanged.
  if (
    normalized.cmd === LEGACY_DEFAULT_CMD ||
    normalized.cmd === "hush -rcfile /profile"
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
  const args = profile.args === "-rcfile /tmp/profile"
    ? "-rcfile /profile"
    : profile.args;
  if (
    id === profile.id && name === profile.name &&
    program === profile.program && args === profile.args
  ) {
    return profile;
  }
  return { ...profile, id, name, program, args };
}

export function normalizeBind(bind = {}) {
  return {
    id: typeof bind.id === "string" && bind.id ? bind.id : createWorkspaceId(),
    type: SUPPORTED_BIND_TYPES.includes(bind.type) ? bind.type : "file",
    dst: typeof bind.dst === "string" ? bind.dst.trim() : "",
    src: typeof bind.src === "string" ? bind.src.trim() : "",
    content: typeof bind.content === "string" ? bind.content : "",
    perm: typeof bind.perm === "string" && bind.perm ? bind.perm : "0644",
    union: SUPPORTED_UNION_MODES.includes(bind.union) ? bind.union : "after",
  };
}

export const LEGACY_SYSTEM_MIRROR_BINDS = new Map([
  ["task", { dst: "task", src: "#task" }],
  ["term", { dst: "term", src: "#term" }],
  ["web", { dst: "web", src: "#web" }],
  ["js", { dst: "js", src: "#js" }],
  ["opfs", { dst: "opfs", src: "#web/opfs" }],
  ["tmp", { dst: "tmp", src: "#ramfs" }],
  ["root", { dst: ".", src: "#ramfs" }],
]);

export const LEGACY_RAMFS_MOUNT_IDS = new Set(["root", "tmp"]);

export function isLegacySystemMirrorBind(bind) {
  const expected = LEGACY_SYSTEM_MIRROR_BINDS.get(bind.id);
  return bind.type === "ns" && expected?.dst === bind.dst &&
    expected.src === bind.src;
}

export function normalizeSystemBind(bind = {}) {
  return {
    id: typeof bind.id === "string" && bind.id ? bind.id : createWorkspaceId(),
    type: SUPPORTED_SYSTEM_BIND_TYPES.includes(bind.type) ? bind.type : "file",
    dst: typeof bind.dst === "string" ? bind.dst.trim() : "",
    src: typeof bind.src === "string" ? bind.src.trim() : "",
    content: typeof bind.content === "string" ? bind.content : "",
    mode: typeof bind.mode === "string" ? bind.mode : "",
    union: SUPPORTED_UNION_MODES.includes(bind.union) ? bind.union : "after",
  };
}

export function normalizeSystemConfig(system) {
  const defaults = clone(DEFAULT_SYSTEM_CONFIG);
  const binds =
    (Array.isArray(system?.binds)
      ? system.binds.map(normalizeSystemBind)
      : defaults.binds.map(normalizeSystemBind)).map((bind) =>
        // Auto-upgrade the bundled shell binary so interpreter fixes reach
        // existing workspaces; mirrors the wanix runtime URL migration.
        bind.dst === "bin/bash" && isLegacyHushBinaryUrl(bind.src)
          ? { ...bind, src: DEFAULT_HUSH_BINARY_URL }
          : bind
      );
  const legacyProfile = system?.profile;
  if (
    legacyProfile &&
    !binds.some((bind) =>
      bind.id === "boot-profile" || bind.dst === "tmp/profile"
    )
  ) {
    binds.push(
      normalizeSystemBind({
        ...legacyProfile,
        id: "boot-profile",
        type: "file",
      }),
    );
  }
  for (const bind of binds) {
    if (
      bind.id === "boot-profile" && bind.type === "file" &&
      bind.dst === "tmp/profile"
    ) {
      bind.dst = "profile";
    }
    if (
      bind.type === "ns" && LEGACY_RAMFS_MOUNT_IDS.has(bind.id) &&
      bind.src === "#ramfs"
    ) {
      bind.src = "#ramfs/new";
    }
  }
  return {
    binds,
    allowOrigins: typeof system?.allowOrigins === "string"
      ? system.allowOrigins.trim().replace(/[\s,]+/g, " ")
      : "",
  };
}

export function validateBind(bind) {
  if (!SUPPORTED_BIND_TYPES.includes(bind.type)) {
    return "Unsupported mount type.";
  }
  if (!bind.dst) return "A destination path is required.";
  if (bind.dst.startsWith("/")) {
    return "Destination paths must not start with a slash.";
  }
  if (bind.type === "ns" && !bind.src.startsWith("#")) {
    return "Namespace mounts must use a # system path.";
  }
  if (bind.type === "file" && !bind.src && !bind.content) {
    return "Provide a URL or inline file content.";
  }
  if (
    (bind.type === "fetch" || bind.type === "archive" ||
      bind.type === "import") && !bind.src
  ) {
    return `${bind.type} mounts require a source URL.`;
  }
  if (!SUPPORTED_UNION_MODES.includes(bind.union)) {
    return "Union position must be before or after.";
  }
  if (!/^[0-7]{3,4}$/.test(bind.perm)) {
    return "Permissions must be an octal mode such as 0644.";
  }
  return null;
}

export function normalizeTask(task = {}) {
  return {
    id: typeof task.id === "string" && task.id ? task.id : createWorkspaceId(),
    name: typeof task.name === "string" && task.name ? task.name : "Task",
    cmd: typeof task.cmd === "string" ? task.cmd.trim() : "",
    type: SUPPORTED_TASK_TYPES.includes(task.type) ? task.type : "auto",
    env: typeof task.env === "string" ? task.env : "",
    wd: typeof task.wd === "string" ? task.wd.trim() : "",
    log: typeof task.log === "string" ? task.log.trim() : "",
    fsys: typeof task.fsys === "string" ? task.fsys.trim() : "",
    term: task.term !== false,
    autoStart: task.autoStart === true,
  };
}

export function validateTask(task) {
  if (!task.cmd) return "A command is required.";
  if (!SUPPORTED_TASK_TYPES.includes(task.type)) {
    return "Unsupported task type.";
  }
  if (task.wd.startsWith("/")) {
    return "Working directories must not start with a slash.";
  }
  return null;
}
