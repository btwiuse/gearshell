---
id: "config.binds.update"
title: "GearShell.config.binds.update"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.binds.update"]
---

# GearShell.config.binds.update

Update a workspace task bind

## Signature

```js
GearShell.config.binds.update(id, bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |
| `bind` | `BindRecord` | yes | Replacement bind. |

## Returns

Replaces the bind by id.

## Examples

### From the shell page

```js
GearShell.config.binds.update("data", { id: "data", type: "ns", dst: "data", src: "#opfs/home/data", mode: "0755" });
```

### From the gear CLI

```js
gear config.binds.update '["x",{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.update"
  ]
}
```
