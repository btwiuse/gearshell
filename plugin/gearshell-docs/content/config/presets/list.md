---
id: "config.presets.list"
title: "GearShell.config.presets.list"
namespace: "config"
kind: "method"
returns: "{ ok, presets }"
sync: true
permissions: ["config.presets.list"]
---

# GearShell.config.presets.list

List workspace presets

## Signature

```js
GearShell.config.presets.list()
```

## Returns

Returns every built-in and custom preset.

## Examples

### From the shell page

```js
GearShell.config.presets.list().presets.forEach(console.log);
```

### From the gear CLI

```js
gear config.presets.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.presets.list"
  ]
}
```
