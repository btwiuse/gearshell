---
id: "config.plugins.setEnabled"
title: "GearShell.config.plugins.setEnabled"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.plugins.setEnabled"]
---

# GearShell.config.plugins.setEnabled

Enable or disable an installed plugin

## Signature

```js
GearShell.config.plugins.setEnabled(id, enabled)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Plugin id. |
| `enabled` | `boolean` | yes | Enabled flag. |

## Returns

Toggles the plugin's enabled flag.

## Examples

### From the shell page

```js
GearShell.config.plugins.setEnabled({ id: "x", enabled: false });
```

### From the gear CLI

```js
gear config.plugins.setEnabled '["x",true]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.plugins.setEnabled"
  ]
}
```
