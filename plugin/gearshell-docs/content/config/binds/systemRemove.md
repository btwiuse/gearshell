---
id: "config.binds.systemRemove"
title: "GearShell.config.binds.systemRemove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.systemRemove"]
---

# GearShell.config.binds.systemRemove

Remove a shared system bind

## Signature

```js
GearShell.config.binds.systemRemove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |

## Returns

Remove a system bind by id. The root bind is protected.

## Examples

### From the shell page

```js
GearShell.config.binds.systemRemove("tools");
```

### From the gear CLI

```js
gear config.binds.systemRemove '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemRemove"
  ]
}
```
