---
id: "config.binds.reorder"
title: "GearShell.config.binds.reorder"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.reorder"]
---

# GearShell.config.binds.reorder

Reorder workspace task binds

## Signature

```js
GearShell.config.binds.reorder(ids)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ids` | `string[]` | yes | New id order. |

## Returns

Sets the bind order to match the supplied id array.

## Examples

### From the shell page

```js
GearShell.config.binds.reorder(["data", "tools", "scratch"]);
```

### From the gear CLI

```js
gear config.binds.reorder '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.reorder"
  ]
}
```
