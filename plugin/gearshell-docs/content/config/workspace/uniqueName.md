---
id: "config.workspace.uniqueName"
title: "GearShell.config.workspace.uniqueName"
namespace: "config"
kind: "method"
returns: "{ ok, name }"
sync: true
permissions: ["config.workspace.uniqueName"]
---

# GearShell.config.workspace.uniqueName

Find an unused workspace name

## Signature

```js
GearShell.config.workspace.uniqueName(name, excludedId)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | yes | Desired name. |
| `excludedId` | `string` | no | Skip this id when checking uniqueness (useful for renames). |

## Returns

Returns a workspace name that doesn't collide.

## Examples

### From the shell page

```js
const { name } = GearShell.config.workspace.uniqueName("My Workspace");
```

### From the gear CLI

```js
gear config.workspace.uniqueName '["x","x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.uniqueName"
  ]
}
```
