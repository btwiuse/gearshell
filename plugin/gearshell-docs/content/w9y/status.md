---
id: "w9y.status"
title: "GearShell.w9y.status"
namespace: "w9y"
kind: "method"
returns: "{ ok, ...status }"
sync: true
permissions: ["w9y.status"]
---

# GearShell.w9y.status

Read one installed package's status (id, version, apply state).

## Signature

```js
GearShell.w9y.status(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Package id. |

## Returns

`{ ok, ...status }`

## Examples

### Read one mod's status

```js
GearShell.w9y.status("@crush/playground");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "w9y.status"
  ]
}
```
