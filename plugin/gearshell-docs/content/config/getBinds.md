---
id: "config.getBinds"
title: "GearShell.config.getBinds"
namespace: "config"
kind: "method"
returns: "{ ok, binds }"
sync: true
permissions: ["config.getBinds"]
---

# GearShell.config.getBinds

The system namespace binds (shared filesystem)

## Signature

```js
GearShell.config.getBinds()
```

## Returns

The binds that compose the shared system namespace.

## Examples

### From the shell page

```js
const root = GearShell.config.getBinds().binds.find(b => b.dst === ".");
```

### From the gear CLI

```js
gear config.getBinds '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.getBinds"
  ]
}
```
