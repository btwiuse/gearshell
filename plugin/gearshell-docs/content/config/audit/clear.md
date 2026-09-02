---
id: "config.audit.clear"
title: "GearShell.config.audit.clear"
namespace: "config"
kind: "method"
returns: "{ ok, cleared }"
sync: true
permissions: ["config.audit.clear"]
---

# GearShell.config.audit.clear

Empty the audit ring

## Signature

```js
GearShell.config.audit.clear()
```

## Returns

Clears the in-memory audit ring.

## Examples

### From the shell page

```js
GearShell.config.audit.clear();
```

### From the gear CLI

```js
gear config.audit.clear '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.audit.clear"
  ]
}
```
