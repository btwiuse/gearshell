---
id: "config.binds.list"
title: "GearShell.config.binds.list"
namespace: "config"
kind: "method"
returns: "{ ok, binds }"
sync: true
permissions: ["config.binds.list"]
---

# GearShell.config.binds.list

List workspace task binds

## Signature

```js
GearShell.config.binds.list()
```

## Returns

The workspace-level binds applied to task namespaces.

## Examples

### From the shell page

```js
GearShell.config.binds.list().binds.forEach(console.log);
```

### From the gear CLI

```js
gear config.binds.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.binds.list"
  ]
}
```
