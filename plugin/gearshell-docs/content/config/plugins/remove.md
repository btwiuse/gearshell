---
id: "config.plugins.remove"
title: "GearShell.config.plugins.remove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.plugins.remove"]
---

# GearShell.config.plugins.remove

Remove an installed plugin

## Signature

```js
GearShell.config.plugins.remove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Plugin id. |

## Returns

Removes the plugin from storage.

## Examples

### From the shell page

```js
GearShell.config.plugins.remove("x");
```

### From the gear CLI

```js
gear config.plugins.remove '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.plugins.remove"
  ]
}
```
