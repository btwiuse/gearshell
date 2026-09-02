---
id: "config.workspace.ensure"
title: "GearShell.config.workspace.ensure"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.workspace.ensure"]
---

# GearShell.config.workspace.ensure

Ensure the workspace store exists

## Signature

```js
GearShell.config.workspace.ensure()
```

## Returns

Bootstraps the workspace store if it isn't already initialised.

## Examples

### From the shell page

```js
GearShell.config.workspace.ensure();
```

### From the gear CLI

```js
gear config.workspace.ensure '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.workspace.ensure"
  ]
}
```
