// Crush Runner launch plumbing: per-panel/per-launch config directories,
// the profile the Crush process is launched with, rcfile writes through
// the Wanix kernel, and the headless-task command helpers the detect and
// install flows share.

import { __getWanixSystem, crushRunnerDep } from "./crush-deps.js?v=20260826.1";

// Pick a per-panel config directory under /tmp. Each CrushRunner instance
// owns its own directory so concurrent Crush launches don't fight over a
// shared ${CRUSH_GLOBAL_CONFIG}/crushrc. The path is derived from the
// runnerId the panel was registered with, which is stable across renders
// within the same panel.
export function crushConfigDirFor(runnerId) {
  // Accept any non-empty string/number id. Dash-separated ids like
  // "2-3" (panel #2, launch #3) used to fall through to the "shared"
  // bucket because Number("2-3") is NaN; that defeated the per-launch
  // isolation guarantee, so we now stringify whatever the caller hands
  // us. Empty/missing falls back to "shared" for sanity.
  if (runnerId === null || runnerId === undefined || runnerId === "") {
    return "/tmp/crush-runner-shared";
  }
  const safeId = String(runnerId).replace(/[^A-Za-z0-9._-]/g, "_");
  return `/tmp/crush-runner-${safeId}`;
}

// Per-launch subdirectory mounted as a fresh ramfs inside the task
// namespace. The id is sanitised the same way as crushConfigDirFor
// so concurrent launches never share the same path.
export function crushRunDirFor(runnerId) {
  const safeId = String(runnerId || "shared").replace(/[^A-Za-z0-9._-]/g, "_");
  return `crushrun-${safeId}`;
}

// Resolve the CRUSH_GLOBAL_CONFIG directory, honouring a user-supplied
// override (rcfilePathState) that wins when present so the Config tab
// input can redirect CRUSH_GLOBAL_CONFIG without changing the panel
// identity. The override may be either a directory (we just normalise
// it) or a full file path ending in `rc` (we trim the filename so the
// env var keeps pointing at a directory, matching crush's own path
// lookup).
export function resolveConfigDir(runnerId, rcfilePathState) {
  const override =
    (typeof rcfilePathState === "string" && rcfilePathState.trim())
      ? rcfilePathState.trim().replace(/\/+$/, "")
      : "";
  if (override) {
    return override.endsWith("rc")
      ? override.slice(0, override.lastIndexOf("/"))
      : override;
  }
  return crushConfigDirFor(runnerId);
}

// Build the profile that the Crush process should be launched with for
// `runnerId`. The wanix-system root is ramfs-backed but won't create
// missing parent directories for a file bind (wanix-bind refuses to
// cross NS boundaries), so we layer the mounts: (1) a fresh ramfs at
// the per-launch subdirectory so the path is writable, (2) a file
// bind at `<subdir>/crushrc` carrying the user's config. Each layer
// references `#ramfs/new` (the allocfs allocator path used elsewhere
// in the workspace) so the kernel mints a fresh memfs instance per
// bind, and the per-launch subdir keeps two simultaneous CrushRunner
// panels from stomping on each other's crush.json state.
// CRUSH_GLOBAL_CONFIG points at the per-launch subdirectory so
// crush's standard XDG/config-dir lookup picks up the mounted rcfile.
export async function prepareCrushLaunch(runnerId, draft, crushrcContent) {
  const userEnv = (draft.env || "").trim();
  const lines = userEnv ? userEnv.split("\n").filter(Boolean) : [];
  const withoutConfig = lines.filter((line) =>
    !/^CRUSH_GLOBAL_CONFIG\s*=/.test(line)
  );
  const configDir = crushRunDirFor(runnerId);
  const mergedEnv = [...withoutConfig, `CRUSH_GLOBAL_CONFIG=/${configDir}`]
    .join(
      "\n",
    );
  return {
    configPath: configDir,
    profile: {
      name: (draft.name || "").trim() || "Crush",
      program: (draft.program || "crush").trim(),
      args: (draft.args || "").trim(),
      type: draft.type || "gojs",
      env: mergedEnv,
      wd: (draft.wd || "").trim(),
      icon: draft.icon || "bot",
      extraBinds: [
        { type: "ns", dst: configDir, src: "#ramfs/new" },
        { type: "file", dst: `${configDir}/crushrc`, content: crushrcContent },
      ],
    },
  };
}

// Write `content` to `${configDir}/crushrc` via the Wanix kernel root.
// Creates the directory if it does not exist; the directory lives under
// /tmp (writable in-memory ramfs) so this never touches the user's OPFS.
export async function writeCrushrc(configDir, content) {
  await crushRunnerDep("waitForWanixSystem")();
  const root = crushRunnerDep("getWanixRoot")();
  try {
    await root.makeDir(configDir);
  } catch (error) {
    // EEXIST is fine; anything else should bubble up. The wanix kernel
    // throws a String (not an Error) so we stringify the whole value
    // rather than reaching for `.message` which would always be empty.
    if (!/exist|exists/i.test(String(error))) throw error;
  }
  // Pass the content as a Uint8Array so multi-byte UTF-8 sequences survive
  // the kernel's writeFile round-trip; hush task env injection also works
  // but going through the kernel API keeps the data on the JS side and
  // avoids spawning a throwaway task for every launch.
  const bytes = new TextEncoder().encode(content);
  await root.writeFile(`${configDir}/crushrc`, bytes);
}

// Spawn a headless wanix-task that runs `cmd` and tear it down when the
// returned `dispose` is called. The task itself does not emit a completion
// event for short-lived shell commands, so callers observe completion via
// filesystem side effects (file presence, marker directory, etc.) and then
// invoke `dispose()` to remove the task from the wanix-system. `onError`
// is called once if the task fails to start. The optional `env` argument is
// the shell environment string (KEY=value lines) the task should see;
// we default to the full Hush environment so w9y and friends can find
// WANIX, PATH, HOME, etc.
export function spawnWanixCommand(
  cmd,
  { env = crushRunnerDep("buildEnv")(""), onError } = {},
) {
  if (!__getWanixSystem()) throw new Error("Wanix system is not available.");
  const task = document.createElement("wanix-task");
  task.setAttribute("cmd", cmd);
  task.setAttribute("type", "gojs");
  task.setAttribute("start", "");
  task.setAttribute("for", "wanix-system");
  task.setAttribute("wd", "/");
  if (env) task.setAttribute("env", env);
  task.addEventListener("error", (event) => {
    onError?.(
      event.detail?.error || event.detail || new Error("Task failed to start."),
    );
  });
  __getWanixSystem().appendChild(task);
  return {
    task,
    dispose: () => {
      if (task.parentNode) task.parentNode.removeChild(task);
    },
  };
}

// Read a filesystem entry as text, returning null when the entry is missing
// or unreadable. Centralizes the decode logic so detection does not have to
// special-case string vs Uint8Array payloads.
export async function readWanixText(path) {
  try {
    const data = await crushRunnerDep("getWanixRoot")().readFile(path);
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(data));
    }
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    return String(data ?? "");
  } catch {
    return null;
  }
}
