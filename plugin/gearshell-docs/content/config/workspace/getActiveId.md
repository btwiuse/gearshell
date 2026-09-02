---
id: "config.workspace.getActiveId"
title: "GearShell.config.workspace.getActiveId"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.workspace.getActiveId"]
---

# GearShell.config.workspace.getActiveId

Read the active workspace id

## Signature

```js
GearShell.config.workspace.getActiveId()
```

## Returns

Cheap accessor for just the active workspace's id.

## Examples

### From the shell page

```js
const id = GearShell.config.workspace.getActiveId().id;
```

### From the gear CLI

```js
gear config.workspace.getActiveId '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.getActiveId"
  ]
}
```
