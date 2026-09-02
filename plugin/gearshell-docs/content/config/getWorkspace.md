---
id: "config.getWorkspace"
title: "GearShell.config.getWorkspace"
namespace: "config"
kind: "method"
returns: "{ ok, workspace }"
sync: true
permissions: ["config.getWorkspace"]
---

# GearShell.config.getWorkspace

Read the raw active workspace

## Signature

```js
GearShell.config.getWorkspace()
```

## Returns

Returns the active workspace object verbatim, including `ui.dockviewLayout`. Provider apiKeys are redacted from embedded provider records.

## Examples

### From the shell page

```js
const ws = GearShell.config.getWorkspace();
if (ws.workspace) console.log(ws.workspace.name);
```

### From the gear CLI

```js
gear config.getWorkspace '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.getWorkspace"
  ]
}
```
