---
id: "agents.prompt"
title: "GearShell.agents.prompt"
namespace: "agents"
kind: "method"
returns: "{ ok, busy?, retryAfterMs? }"
sync: true
permissions: ["agents.prompt"]
---

# GearShell.agents.prompt

Inject a line into a live terminal session. The terminal may be busy running a previous command and the call may refuse with `{ ok: true, busy: true, retryAfterMs: N }`. Wait and retry, or use `gear agents.prompt-wait` from the CLI.

## Signature

```js
GearShell.agents.prompt(id, text, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id (e.g. `"terminal-1"`). |
| `text` | `string` | yes | Text to inject (a trailing newline is usually expected). |
| `options` | `{ force? }` | no | Pass `{ force: true }` to bypass the busy check. |

## Returns

`{ ok, busy?, retryAfterMs? }`

## Examples

### Inject a command

```js
const reply = GearShell.agents.prompt("terminal-1", "ls -la\n");
if (reply.busy) {
  // retry after reply.retryAfterMs
}
```

### Bypass the busy gate

```js
GearShell.agents.prompt("terminal-1", "Ctrl+C", { force: true });
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "agents.prompt"
  ]
}
```
