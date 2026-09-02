---
id: "config.audit.list"
title: "GearShell.config.audit.list"
namespace: "config"
kind: "method"
returns: "{ ok, entries }"
sync: true
permissions: ["config.audit.list"]
---

# GearShell.config.audit.list

List the config-change audit ring

## Signature

```js
GearShell.config.audit.list()
```

## Returns

Returns the most recent audited shell changes.

## Examples

### From the shell page

```js
GearShell.config.audit.list().entries.forEach(e => console.log(e.id, e.kind));
```

### From the gear CLI

```js
gear config.audit.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.audit.list"
  ]
}
```
