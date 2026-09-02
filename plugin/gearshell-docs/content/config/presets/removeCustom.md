---
id: "config.presets.removeCustom"
title: "GearShell.config.presets.removeCustom"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.presets.removeCustom"]
---

# GearShell.config.presets.removeCustom

Remove a custom workspace preset

## Signature

```js
GearShell.config.presets.removeCustom(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Preset id. |

## Returns

Removes the preset by id. Built-in presets cannot be removed.

## Examples

### From the shell page

```js
GearShell.config.presets.removeCustom("research");
```

### From the gear CLI

```js
gear config.presets.removeCustom '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.presets.removeCustom"
  ]
}
```
