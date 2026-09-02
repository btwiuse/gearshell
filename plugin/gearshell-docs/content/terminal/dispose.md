---
id: "terminal.dispose"
title: "GearShell.terminal.dispose"
namespace: "terminal"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["terminal.dispose"]
---

# GearShell.terminal.dispose

Dispose a terminal session

## Signature

```js
GearShell.terminal.dispose(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |

## Returns

`{ ok }`

## Examples

### From the shell page

```js
GearShell.terminal.dispose(id);
```

### From the gear CLI (write only)

```js
gear terminal.write '["terminal-1","ls\\n"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "terminal.dispose"
  ]
}
```
