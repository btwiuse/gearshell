---
id: "config.getTaskBinds"
title: "GearShell.config.getTaskBinds"
namespace: "config"
kind: "method"
returns: "{ ok, binds }"
sync: true
permissions: ["config.getTaskBinds"]
---

# GearShell.config.getTaskBinds

Per-task binds (workspace.binds)

## Signature

```js
GearShell.config.getTaskBinds()
```

## Returns

The binds applied only to workspace task namespaces.

## Examples

### From the shell page

```js
GearShell.config.getTaskBinds().binds.forEach(console.log);
```

### From the gear CLI

```js
gear config.getTaskBinds '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.getTaskBinds"
  ]
}
```
