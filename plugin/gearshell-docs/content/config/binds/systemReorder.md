---
id: "config.binds.systemReorder"
title: "GearShell.config.binds.systemReorder"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.systemReorder"]
---

# GearShell.config.binds.systemReorder

Reorder shared system binds

## Signature

```js
GearShell.config.binds.systemReorder(ids)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ids` | `string[]` | yes | New id order. |

## Returns

Sets the bind order.

## Examples

### From the shell page

```js
GearShell.config.binds.systemReorder(["tools", "data"]);
```

### From the gear CLI

```js
gear config.binds.systemReorder '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemReorder"
  ]
}
```
