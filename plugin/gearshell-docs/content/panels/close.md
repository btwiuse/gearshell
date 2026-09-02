---
id: "panels.close"
title: "GearShell.panels.close"
namespace: "panels"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["panels.close"]
---

# GearShell.panels.close

Close a panel by id. Use `panels.list` to find ids.

## Signature

```js
GearShell.panels.close(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Panel id. |

## Returns

`{ ok, id }`

## Examples

### Close a panel

```js
GearShell.panels.close("settings-1");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "panels.close"
  ]
}
```
