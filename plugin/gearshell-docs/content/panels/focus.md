---
id: "panels.focus"
title: "GearShell.panels.focus"
namespace: "panels"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["panels.focus"]
---

# GearShell.panels.focus

Activate a panel by id. The panel becomes the focused tab.

## Signature

```js
GearShell.panels.focus(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Panel id. |

## Returns

`{ ok, id }`

## Examples

### Focus the home panel

```js
GearShell.panels.focus("home-1");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "panels.focus"
  ]
}
```
