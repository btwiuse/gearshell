---
id: "config.workspace.delete"
title: "GearShell.config.workspace.delete"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.workspace.delete"]
---

# GearShell.config.workspace.delete

Delete a workspace

## Signature

```js
GearShell.config.workspace.delete(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Workspace id. |

## Returns

Removes the workspace. The active workspace cannot be deleted.

## Examples

### From the shell page

```js
GearShell.config.workspace.delete("ws-2");
```

### From the gear CLI

```js
gear config.workspace.delete '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.delete"
  ]
}
```
