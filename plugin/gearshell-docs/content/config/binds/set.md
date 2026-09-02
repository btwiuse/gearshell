---
id: "config.binds.set"
title: "GearShell.config.binds.set"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.binds.set"]
---

# GearShell.config.binds.set

Replace workspace task binds

## Signature

```js
GearShell.config.binds.set(binds)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `binds` | `BindRecord[]` | yes | New bind list. |

## Returns

Replaces the bind list atomically.

## Examples

### From the shell page

```js
GearShell.config.binds.set([{ id: "data", type: "ns", dst: "data", src: "#opfs/home/data" }]);
```

### From the gear CLI

```js
gear config.binds.set '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.set"
  ]
}
```
