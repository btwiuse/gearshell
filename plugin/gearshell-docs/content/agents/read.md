---
id: "agents.read"
title: "GearShell.agents.read"
namespace: "agents"
kind: "method"
returns: "{ ok, text }"
sync: true
permissions: ["agents.read"]
---

# GearShell.agents.read

Snapshot the terminal scrollback as plain text. Pass `{ rows: N }` to limit the snapshot to the last N lines.

## Signature

```js
GearShell.agents.read(id, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `options` | `{ rows? }` | no | Limit to the last N rows. |

## Returns

`{ ok, text }`

## Examples

### Read last 100 lines

```js
const { text } = GearShell.agents.read("terminal-1", { rows: 100 });
console.log(text);
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "agents.read"
  ]
}
```
