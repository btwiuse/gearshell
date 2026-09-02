---
id: "terminal.write"
title: "GearShell.terminal.write"
namespace: "terminal"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["terminal.write"]
---

# GearShell.terminal.write

Write input data to a terminal session

## Signature

```js
GearShell.terminal.write(id, data)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `data` | `string | Uint8Array` | yes | Data to write. Plain string is UTF-8 encoded. |

## Returns

`{ ok }`

## Examples

### From the shell page

```js
const { id } = GearShell.terminal.create({ cmd: "/bin/bash", term: true });
GearShell.terminal.write(id, "ls\n");
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
    "terminal.write"
  ]
}
```
