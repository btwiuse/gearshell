---
id: "config.binds.systemSet"
title: "GearShell.config.binds.systemSet"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.systemSet"]
---

# GearShell.config.binds.systemSet

Replace shared system binds

## Signature

```js
GearShell.config.binds.systemSet(binds)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `binds` | `BindRecord[]` | yes | New bind list. |

## Returns

Replace the entire system bind list.

## Examples

### From the shell page

```js
GearShell.config.binds.systemSet([{ id: "root", type: "ns", dst: ".", src: "#ramfs/new" }]);
```

### From the gear CLI

```js
gear config.binds.systemSet '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemSet"
  ]
}
```
