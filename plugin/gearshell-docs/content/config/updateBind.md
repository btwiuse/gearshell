---
id: "config.updateBind"
title: "GearShell.config.updateBind"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.updateBind"]
---

# GearShell.config.updateBind

Replace a system bind by id

## Signature

```js
GearShell.config.updateBind(id, bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Bind id. |
| `bind` | `BindRecord` | yes | The new bind. |

## Returns

Replaces a bind in place.

## Examples

### From the shell page

```js
GearShell.config.updateBind("tools", { id: "tools", type: "ns", dst: "tools", src: "#ramfs/new", mode: "0755" });
```

### From the gear CLI

```js
gear config.updateBind '["x",{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.updateBind"
  ]
}
```
