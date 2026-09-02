---
id: "config.presets.uniqueName"
title: "GearShell.config.presets.uniqueName"
namespace: "config"
kind: "method"
returns: "{ ok, name }"
sync: true
permissions: ["config.presets.uniqueName"]
---

# GearShell.config.presets.uniqueName

Find an unused preset name

## Signature

```js
GearShell.config.presets.uniqueName(name)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | yes | Desired name. |

## Returns

Returns a preset name that doesn't collide.

## Examples

### From the shell page

```js
const { name } = GearShell.config.presets.uniqueName("My Preset");
```

### From the gear CLI

```js
gear config.presets.uniqueName '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.presets.uniqueName"
  ]
}
```
