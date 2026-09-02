---
id: "config.workspace.import"
title: "GearShell.config.workspace.import"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.workspace.import"]
---

# GearShell.config.workspace.import

Import workspace JSON as a new workspace

## Signature

```js
GearShell.config.workspace.import(serialized)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `serialized` | `string` | yes | Workspace JSON. |

## Returns

Parses, validates, and stores a new workspace from the given JSON string.

## Examples

### From the shell page

```js
GearShell.config.workspace.import(jsonString);
```

### From the gear CLI

```js
gear config.workspace.import '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.import"
  ]
}
```
