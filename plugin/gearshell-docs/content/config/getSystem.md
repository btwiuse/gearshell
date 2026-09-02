---
id: "config.getSystem"
title: "GearShell.config.getSystem"
namespace: "config"
kind: "method"
returns: "{ ok, system }"
sync: true
permissions: ["config.getSystem"]
---

# GearShell.config.getSystem

Read normalized system binds + runtime pin + shell config

## Signature

```js
GearShell.config.getSystem()
```

## Returns

The merged view of the system binds (the `bin/gear` mount, the runtime pin, and any custom mounts) plus the wanix runtime pin.

## Examples

### From the shell page

```js
const sys = GearShell.config.getSystem();
console.table(sys.system.binds);
```

### From the gear CLI

```js
gear config.getSystem '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.getSystem"
  ]
}
```
