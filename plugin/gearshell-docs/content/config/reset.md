---
id: "config.reset"
title: "GearShell.config.reset"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.reset"]
---

# GearShell.config.reset

Reset the active workspace shell config to defaults

## Signature

```js
GearShell.config.reset()
```

## Returns

Replaces the entire shell config with the built-in defaults.

## Examples

### From the shell page

```js
GearShell.config.reset();
GearShell.config.reload();
```

### From the gear CLI

```js
gear config.reset '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.reset"
  ]
}
```
