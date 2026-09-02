---
id: "config.binds.systemList"
title: "GearShell.config.binds.systemList"
namespace: "config"
kind: "method"
returns: "{ ok, binds }"
sync: true
permissions: ["config.binds.systemList"]
---

# GearShell.config.binds.systemList

List shared system binds

## Signature

```js
GearShell.config.binds.systemList()
```

## Returns

Same as `config.getBinds().binds` — exposed for symmetry.

## Examples

### From the shell page

```js
GearShell.config.binds.systemList().binds.forEach(console.log);
```

### From the gear CLI

```js
gear config.binds.systemList '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.systemList"
  ]
}
```
