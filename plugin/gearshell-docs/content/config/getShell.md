---
id: "config.getShell"
title: "GearShell.config.getShell"
namespace: "config"
kind: "method"
returns: "{ ok, shell }"
sync: true
permissions: ["config.getShell"]
---

# GearShell.config.getShell

Read the normalized shell config

## Signature

```js
GearShell.config.getShell()
```

## Returns

Returns the active shell config with `apiKeys` redacted for every provider. Use this from a plugin to inspect the current shell state without touching storage directly.

## Examples

### From the shell page

```js
const cfg = GearShell.config.getShell();
console.log(cfg.shell.providers);
```

### From the gear CLI

```js
gear config.getShell '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.getShell"
  ]
}
```
