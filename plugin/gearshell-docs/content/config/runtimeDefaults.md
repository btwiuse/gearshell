---
id: "config.runtimeDefaults"
title: "GearShell.config.runtimeDefaults"
namespace: "config"
kind: "method"
returns: "{ ok, defaults }"
sync: true
permissions: ["config.runtimeDefaults"]
---

# GearShell.config.runtimeDefaults

Read the built-in Wanix runtime defaults

## Signature

```js
GearShell.config.runtimeDefaults()
```

## Returns

The runtime defaults the shell would apply if the runtime pin were empty.

## Examples

### From the shell page

```js
GearShell.config.runtimeDefaults().defaults;
```

### From the gear CLI

```js
gear config.runtimeDefaults '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.runtimeDefaults"
  ]
}
```
