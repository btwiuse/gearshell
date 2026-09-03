---
id: "bash.run"
title: "GearShell.bash.run"
namespace: "bash"
kind: "method"
returns: "Promise<{ ok, command, taskId?, exitCode?, output?, error? }>"
sync: false
permissions: ["bash.run"]
---

# GearShell.bash.run

Run one non-interactive bash command in a headless workspace task and resolve after it exits. The result includes captured stdout and stderr, plus the exit code when the command starts successfully.

## Signature

```js
await GearShell.bash.run(command, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | `string` | yes | A non-empty bash command to run. |
| `options` | `{ cwd?: string, env?: Record<string, string>, timeoutMs?: number }` | no | Optional working directory, environment variables, and timeout in milliseconds (default: 60000). |

## Returns

A promise resolving to `{ ok, command, taskId, exitCode, output }`, or `{ ok: false, command, error }` when validation, startup, or timeout fails.

## Notes

- Unlike the synchronous jsfs and `gear` surfaces, `bash.run` returns a promise and is intended for in-page or iframe callers.
- The command runs headlessly. Use `tasks.create` for a long-running or interactive terminal task.

## Examples

### Capture command output

```js
const result = await GearShell.bash.run("printf 'hello\\n'");
console.log(result.output);
```

### Set a directory, environment, and timeout

```js
const result = await GearShell.bash.run("printf '%s\\n' \"$NAME\"", {
  cwd: "/opfs/home",
  env: { NAME: "GearShell" },
  timeoutMs: 10_000,
});
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "bash.run"
  ]
}
```
