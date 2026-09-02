---
id: "config.presets.saveCustom"
title: "GearShell.config.presets.saveCustom"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.presets.saveCustom"]
---

# GearShell.config.presets.saveCustom

Save a custom workspace preset

## Signature

```js
GearShell.config.presets.saveCustom(preset)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `preset` | `PresetRecord` | yes | Preset record. |

## Returns

Persists a preset record.

## Examples

### From the shell page

```js
GearShell.config.presets.saveCustom({ id: "research", name: "Research", tasks: [] });
```

### From the gear CLI

```js
gear config.presets.saveCustom '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.presets.saveCustom"
  ]
}
```
