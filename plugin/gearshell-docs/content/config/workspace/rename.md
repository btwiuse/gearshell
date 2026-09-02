---
id: "config.workspace.rename"
title: "GearShell.config.workspace.rename"
namespace: "config"
kind: "method"
returns: "{ ok, id, name }"
sync: true
permissions: ["config.workspace.rename"]
---

# GearShell.config.workspace.rename

Rename a workspace

## Signature

```js
GearShell.config.workspace.rename(id, name)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Workspace id. |
| `name` | `string` | yes | New display name. |

## Returns

Sets a new display name. The id stays the same.

## Examples

### From the shell page

```js
GearShell.config.workspace.rename("ws-2", "Research");
```

### From the gear CLI

```js
gear config.workspace.rename '["x","x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.rename"
  ]
}
```
