---
id: "config.workspace.duplicate"
title: "GearShell.config.workspace.duplicate"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.workspace.duplicate"]
---

# GearShell.config.workspace.duplicate

Duplicate a workspace

## Signature

```js
GearShell.config.workspace.duplicate(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Workspace id. |

## Returns

Clones the workspace's tasks, binds, and ui.

## Examples

### From the shell page

```js
GearShell.config.workspace.duplicate("ws-1");
```

### From the gear CLI

```js
gear config.workspace.duplicate '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.duplicate"
  ]
}
```
