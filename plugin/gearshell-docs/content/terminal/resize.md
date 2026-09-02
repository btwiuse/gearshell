---
id: "terminal.resize"
title: "GearShell.terminal.resize"
namespace: "terminal"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["terminal.resize"]
---

# GearShell.terminal.resize

Update terminal dimensions

## Signature

```js
GearShell.terminal.resize(id, cols, rows)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `cols` | `number` | yes | Columns. |
| `rows` | `number` | yes | Rows. |

## Returns

`{ ok }`

## Examples

### From the shell page

```js
GearShell.terminal.resize(id, 120, 32);
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
    "terminal.resize"
  ]
}
```
