---
id: "config.workspace.list"
title: "GearShell.config.workspace.list"
namespace: "config"
kind: "method"
returns: "{ ok, workspaces }"
sync: true
permissions: ["config.workspace.list"]
---

# GearShell.config.workspace.list

List workspaces

## Signature

```js
GearShell.config.workspace.list()
```

## Returns

Returns every workspace summary (id + name + active flag).

## Examples

### From the shell page

```js
GearShell.config.workspace.list().workspaces.forEach(console.log);
```

### From the gear CLI

```js
gear config.workspace.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.list"
  ]
}
```
