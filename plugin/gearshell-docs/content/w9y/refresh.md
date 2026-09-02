---
id: "w9y.refresh"
title: "GearShell.w9y.refresh"
namespace: "w9y"
kind: "method"
returns: "{ ok, note }"
sync: true
permissions: ["w9y.refresh"]
---

# GearShell.w9y.refresh

Re-read the on-disk registry from `w9y-registry.json`. Useful after a manual `w9y mod apply` from another tab.

## Signature

```js
GearShell.w9y.refresh()
```

## Returns

`{ ok, note }`

## Examples

### Refresh the registry

```js
GearShell.w9y.refresh();
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "w9y.refresh"
  ]
}
```
