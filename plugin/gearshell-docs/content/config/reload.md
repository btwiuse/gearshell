---
id: "config.reload"
title: "GearShell.config.reload"
namespace: "config"
kind: "method"
returns: "{ ok, started }"
sync: true
permissions: ["config.reload"]
---

# GearShell.config.reload

Restart the workspace

## Signature

```js
GearShell.config.reload()
```

## Returns

Kills every workspace task and reloads the page. The new shell picks up any bind, runtime, or workspace changes that were queued.

## Examples

### From the shell page

```js
GearShell.config.reload();
```

### From the gear CLI

```js
gear config.reload '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.reload"
  ]
}
```
