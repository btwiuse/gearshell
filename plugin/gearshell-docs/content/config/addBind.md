---
id: "config.addBind"
title: "GearShell.config.addBind"
namespace: "config"
kind: "method"
returns: "{ ok, bind }"
sync: true
permissions: ["config.addBind"]
---

# GearShell.config.addBind

Append a system bind (takes effect on reload)

## Signature

```js
GearShell.config.addBind(bind)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `bind` | `BindRecord` | yes | The bind to add. |

## Returns

Adds a bind to the system namespace. Reload the workspace with `config.reload` to materialise the new mount.

## Examples

### From the shell page

```js
GearShell.config.addBind({ id: "tools", type: "ns", dst: "tools", src: "#ramfs/new" });
```

### From the gear CLI

```js
gear config.addBind '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.addBind"
  ]
}
```
