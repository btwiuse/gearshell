---
id: "config.workspace.replaceActive"
title: "GearShell.config.workspace.replaceActive"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.workspace.replaceActive"]
---

# GearShell.config.workspace.replaceActive

Replace the active workspace with workspace JSON

## Signature

```js
GearShell.config.workspace.replaceActive(serialized)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `serialized` | `string` | yes | Workspace JSON. |

## Returns

Replaces the active workspace in place. The page reloads to apply the change.

## Examples

### From the shell page

```js
GearShell.config.workspace.replaceActive(jsonString);
GearShell.config.reload();
```

### From the gear CLI

```js
gear config.workspace.replaceActive '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.replaceActive"
  ]
}
```
