---
id: "config.workspace.parse"
title: "GearShell.config.workspace.parse"
namespace: "config"
kind: "method"
returns: "{ ok, workspace } | { ok, error }"
sync: true
permissions: ["config.workspace.parse"]
---

# GearShell.config.workspace.parse

Parse and normalize workspace JSON

## Signature

```js
GearShell.config.workspace.parse(serialized)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `serialized` | `string` | yes | Workspace JSON. |

## Returns

Validates a serialized workspace string. Does not import.

## Examples

### From the shell page

```js
GearShell.config.workspace.parse(jsonString);
```

### From the gear CLI

```js
gear config.workspace.parse '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.parse"
  ]
}
```
