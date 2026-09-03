// workspace-bash-api.js — the bash namespace for one-shot command runs.
//
// `bash.run(command, options)` spawns a headless background task that
// pipes its stdout/stderr into a per-task log, waits for it to reach a
// terminal status, and resolves with the captured output + exit code.
//
// Implementation reuses the proven runHeadlessTask primitive: the
// kernel task element routes console output to a worker channel that
// we capture by wrapping the command with a `tee` to a per-task log file
// (wrapHeadlessCmd already does that for `tasks.create({headless:true})`).
// The bash namespace exposes a single `run` method so it stays tiny —
// the parent GearShell surface is wrapped in `safe()` by the namespace
// wrapper in workspace-api.js, so errors surface as {ok:false,error}.

import { runHeadlessTask } from "./workspace-tasks-api.js";

function buildBashTaskSpec(command, { cwd, env, timeoutMs } = {}) {
  return {
    name: "bash",
    cmd: command,
    term: false,
    ...(cwd ? { workdir: cwd } : {}),
    ...(env ? { env } : {}),
    ...(Number.isFinite(timeoutMs) ? { timeoutMs } : {}),
  };
}

export const bashApi = {
  /**
   * Run a single bash command and resolve with the captured output.
   *
   * Options:
   *   cwd     — working directory inside the wanix VFS
   *   env     — { KEY: "value" } env vars passed to the spawned bash
   *   timeoutMs — default 60000, kill the task after this many ms
   *
   * Returns: { ok, command, taskId, exitCode, output, error? }
   */
  run(command, options = {}) {
    if (typeof command !== "string" || command.trim() === "") {
      return Promise.resolve({
        ok: false,
        command: String(command ?? ""),
        error: "bash.run: command must be a non-empty string",
      });
    }
    const spec = buildBashTaskSpec(command, options);
    return runHeadlessTask(spec, {
      timeoutMs: options.timeoutMs ?? 60000,
    }).then((result) => ({
      ...result,
      command,
    }));
  },
};
