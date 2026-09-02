---
id: "config.workspace.getActive"
title: "GearShell.config.workspace.getActive"
namespace: "config"
kind: "method"
returns: "{ ok, workspace }"
sync: true
permissions: ["config.workspace.getActive"]
---

# GearShell.config.workspace.getActive

Read the active workspace

## Signature

```js
GearShell.config.workspace.getActive()
```

## Returns

Returns the full active workspace.

## Examples

### From the shell page

```js
const ws = GearShell.config.workspace.getActive().workspace;
```

### From the gear CLI

```js
gear config.workspace.getActive '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.getActive"
  ]
}
```
