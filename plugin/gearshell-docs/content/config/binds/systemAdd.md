---
id: "config.binds.systemAdd"
title: "GearShell.config.binds.systemAdd"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.binds.systemAdd"]
---

# GearShell.config.binds.systemAdd

Add a shared system bind

## Signature

```js
GearShell.config.binds.systemAdd(bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `bind` | `BindRecord` | yes | Bind to add. |

## Returns

Append a bind to the system namespace. Reload to apply.

## Examples

### From the shell page

```js
GearShell.config.binds.systemAdd({ id: "tools", type: "ns", dst: "tools", src: "#ramfs/new" });
```

### From the gear CLI

```js
gear config.binds.systemAdd '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemAdd"
  ]
}
```
