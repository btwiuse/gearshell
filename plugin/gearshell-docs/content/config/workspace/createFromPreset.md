---
id: "config.workspace.createFromPreset"
title: "GearShell.config.workspace.createFromPreset"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.workspace.createFromPreset"]
---

# GearShell.config.workspace.createFromPreset

Create a workspace from a preset

## Signature

```js
GearShell.config.workspace.createFromPreset(presetId)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `presetId` | `string` | yes | Preset id. |

## Returns

Creates a new workspace initialised with the given preset.

## Examples

### From the shell page

```js
GearShell.config.workspace.createFromPreset("blank");
```

### From the gear CLI

```js
gear config.workspace.createFromPreset '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.createFromPreset"
  ]
}
```
