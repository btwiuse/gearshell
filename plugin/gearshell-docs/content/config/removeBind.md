---
id: "config.removeBind"
title: "GearShell.config.removeBind"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.removeBind"]
---

# GearShell.config.removeBind

Remove a system bind

## Signature

```js
GearShell.config.removeBind(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |

## Returns

Removes a bind by id. The root bind (`dst: "."`) is protected.

## Examples

### From the shell page

```js
GearShell.config.removeBind("tools");
```

### From the gear CLI

```js
gear config.removeBind '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.removeBind"
  ]
}
```
