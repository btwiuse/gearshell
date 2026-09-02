---
id: "config.audit.undo"
title: "GearShell.config.audit.undo"
namespace: "config"
kind: "method"
returns: "{ ok, restored }"
sync: true
permissions: ["config.audit.undo"]
---

# GearShell.config.audit.undo

Restore the config snapshot saved before that change

## Signature

```js
GearShell.config.audit.undo(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Audit entry id. |

## Returns

Restores the snapshot saved before the audit entry with the given id.

## Examples

### From the shell page

```js
GearShell.config.audit.undo("audit-12345");
```

### From the gear CLI

```js
gear config.audit.undo '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.audit.undo"
  ]
}
```
