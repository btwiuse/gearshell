const BASH_TOOL_NAME = "bash_run";

const BASH_TOOLS = [
  {
    name: BASH_TOOL_NAME,
    description:
      "Run one non-interactive Bash command in the GearShell sandbox. Use it for filesystem inspection, reading or writing workspace files, and multi-step shell work. The result includes ok, exitCode, and combined stdout/stderr in output. Examples: list a directory with `ls -la /opfs/home`; read a file with `cat /opfs/home/README.md`; write a file with `printf '%s\\n' 'hello' > /opfs/home/hello.txt`; inspect a failure with `command-that-fails 2>&1`. Prefer short, deterministic commands and check exitCode before relying on output.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Required Bash source. Examples: `pwd`, `find /opfs/home -maxdepth 2 -type f`, or `cat /opfs/home/README.md`.",
        },
        cwd: {
          type: "string",
          description: "Optional sandbox-VFS working directory. Example: `/opfs/home/project` lets `ls` and relative paths run there.",
        },
        env: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional string environment variables for this command only. Example: `{\"MODE\":\"test\",\"NAME\":\"Bonsai\"}`.",
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds, capped at 60000. Use a bounded value such as 10000 for quick commands.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

function toolError(message) {
  return JSON.stringify({ ok: false, error: message });
}

function toolResult(value) {
  return JSON.stringify({ ok: true, result: value });
}

function normaliseArguments(call) {
  const args = call?.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const { command, cwd, env, timeoutMs } = args;
  return {
    command,
    options: {
      ...(typeof cwd === "string" ? { cwd } : {}),
      ...(env && typeof env === "object" && !Array.isArray(env) ? { env } : {}),
      ...(Number.isFinite(timeoutMs) ? { timeoutMs: Math.min(timeoutMs, 60000) } : {}),
    },
  };
}

async function executeBashRun(call) {
  const input = normaliseArguments(call);
  if (typeof input?.command !== "string" || input.command.trim() === "") {
    return toolError("bash_run needs a non-empty command.");
  }
  if (typeof window.GearShell?.bash?.run !== "function") {
    return toolError("GearShell API is unavailable: bash.run");
  }
  try {
    return toolResult(await window.GearShell.bash.run(input.command, input.options));
  } catch (error) {
    return toolError(String(error?.message ?? error));
  }
}

export function getGearShellTools() {
  return BASH_TOOLS.map((tool) => ({ type: "function", function: tool }));
}

export async function executeToolCall(call) {
  if (call?.name !== BASH_TOOL_NAME) {
    return toolError(`Unknown tool: ${String(call?.name ?? "")}`);
  }
  return executeBashRun(call);
}
