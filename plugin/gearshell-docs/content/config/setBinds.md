---
id: "config.setBinds"
title: "GearShell.config.setBinds"
namespace: "config"
kind: "method"
returns: "{ ok, binds }"
sync: true
permissions: ["config.setBinds"]
---

# GearShell.config.setBinds

Atomically replace all system binds

## Signature

```js
GearShell.config.setBinds(binds)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `binds` | `BindRecord[]` | yes | The new bind list. Must include the root bind. |

## Returns

Replaces the entire bind list atomically. The root bind must survive in the replacement list or the call rejects.

## Examples

### From the shell page

```js
GearShell.config.setBinds([
  { id: "root", type: "ns", dst: ".", src: "#ramfs/new" },
  { id: "bin", type: "ns", dst: "bin", src: "#js/binds/bin" },
]);
```

### From the gear CLI

```js
gear config.setBinds '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.setBinds"
  ]
}
```
