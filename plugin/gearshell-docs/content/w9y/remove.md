---
id: "w9y.remove"
title: "GearShell.w9y.remove"
namespace: "w9y"
kind: "method"
returns: "{ ok, id, note }"
sync: true
permissions: ["w9y.remove"]
---

# GearShell.w9y.remove

Start removing a w9y package.

## Signature

```js
GearShell.w9y.remove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Package id. |

## Returns

`{ ok, id, note }`

## Examples

### Remove a mod

```js
GearShell.w9y.remove("@crush/playground");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "w9y.remove"
  ]
}
```
