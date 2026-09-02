---
id: "config.presets.getCustom"
title: "GearShell.config.presets.getCustom"
namespace: "config"
kind: "method"
returns: "{ ok, preset }"
sync: true
permissions: ["config.presets.getCustom"]
---

# GearShell.config.presets.getCustom

Read a custom workspace preset

## Signature

```js
GearShell.config.presets.getCustom(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Preset id. |

## Returns

Returns the full preset definition. Built-in presets are not exposed here.

## Examples

### From the shell page

```js
GearShell.config.presets.getCustom("blank");
```

### From the gear CLI

```js
gear config.presets.getCustom '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.presets.getCustom"
  ]
}
```
