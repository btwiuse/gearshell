// Normalizers and validators for workspace system binds and tasks
// (split out of app-normalize.js so no file exceeds the 500-line
// budget). Pure functions. app-normalize.js re-exports these so its
// public API is unchanged.

import {
  DEFAULT_HUSH_BINARY_URL,
  DEFAULT_SYSTEM_CONFIG,
  isLegacyHushBinaryUrl,
  SUPPORTED_BIND_TYPES,
  SUPPORTED_SYSTEM_BIND_TYPES,
  SUPPORTED_TASK_TYPES,
  SUPPORTED_UNION_MODES,
} from "./app-constants.js?v=20260828.96";
import { createWorkspaceId } from "./app-storage.js?v=20260826.94";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
