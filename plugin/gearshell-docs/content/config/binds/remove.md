---
id: "config.binds.remove"
title: "GearShell.config.binds.remove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.remove"]
---

# GearShell.config.binds.remove

Remove a workspace task bind

## Signature

```js
GearShell.config.binds.remove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |

## Returns

Removes the bind by id.

## Examples

### From the shell page

```js
GearShell.config.binds.remove("data");
```

### From the gear CLI

```js
gear config.binds.remove '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.remove"
  ]
}
```
