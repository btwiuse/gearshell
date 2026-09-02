---
id: "config.launcher.normalizeOrder"
title: "GearShell.config.launcher.normalizeOrder"
namespace: "config"
kind: "method"
returns: "{ ok, order }"
sync: true
permissions: ["config.launcher.normalizeOrder"]
---

# GearShell.config.launcher.normalizeOrder

Normalize launcher ordering

## Signature

```js
GearShell.config.launcher.normalizeOrder(order)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order` | `string[]` | yes | Component ids in desired order. |

## Returns

Returns the launcher order after validation.

## Examples

### From the shell page

```js
GearShell.config.launcher.normalizeOrder(["home", "files", "terminal"]);
```

### From the gear CLI

```js
gear config.launcher.normalizeOrder '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.launcher.normalizeOrder"
  ]
}
```
