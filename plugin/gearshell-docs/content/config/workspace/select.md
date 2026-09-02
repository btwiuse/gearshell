---
id: "config.workspace.select"
title: "GearShell.config.workspace.select"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.workspace.select"]
---

# GearShell.config.workspace.select

Select the active workspace

## Signature

```js
GearShell.config.workspace.select(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Workspace id. |

## Returns

Switches the active workspace.

## Examples

### From the shell page

```js
GearShell.config.workspace.select("ws-2");
```

### From the gear CLI

```js
gear config.workspace.select '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.select"
  ]
}
```
