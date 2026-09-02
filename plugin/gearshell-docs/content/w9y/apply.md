---
id: "w9y.apply"
title: "GearShell.w9y.apply"
namespace: "w9y"
kind: "method"
returns: "{ ok, id, note }"
sync: true
permissions: ["w9y.apply"]
---

# GearShell.w9y.apply

Start installing a w9y package. The call returns immediately; results arrive as `w9y.changed` events (consume via `events.on` or `events.drain`).

## Signature

```js
GearShell.w9y.apply(id, version)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Package id. |
| `version` | `string` | no | Specific version; defaults to latest. |

## Returns

`{ ok, id, note }`

## Examples

### Install latest

```js
GearShell.w9y.apply("@crush/playground");
```

### Install pinned version

```js
GearShell.w9y.apply("@crush/playground", "1.2.3");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "w9y.apply"
  ]
}
```
