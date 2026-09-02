---
id: "config.binds.systemUpdate"
title: "GearShell.config.binds.systemUpdate"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.binds.systemUpdate"]
---

# GearShell.config.binds.systemUpdate

Update a shared system bind

## Signature

```js
GearShell.config.binds.systemUpdate(id, bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |
| `bind` | `BindRecord` | yes | Replacement bind. |

## Returns

Replace a system bind by id.

## Examples

### From the shell page

```js
GearShell.config.binds.systemUpdate("tools", { id: "tools", type: "ns", dst: "tools", src: "#ramfs/new", mode: "0755" });
```

### From the gear CLI

```js
gear config.binds.systemUpdate '["x",{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemUpdate"
  ]
}
```
