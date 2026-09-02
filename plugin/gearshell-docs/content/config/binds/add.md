---
id: "config.binds.add"
title: "GearShell.config.binds.add"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.binds.add"]
---

# GearShell.config.binds.add

Add a workspace task bind

## Signature

```js
GearShell.config.binds.add(bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `bind` | `BindRecord` | yes | Bind to add. |

## Returns

Adds a bind; reload to materialise it.

## Examples

### From the shell page

```js
GearShell.config.binds.add({ id: "data", type: "ns", dst: "data", src: "#opfs/home/data" });
```

### From the gear CLI

```js
gear config.binds.add '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.add"
  ]
}
```
