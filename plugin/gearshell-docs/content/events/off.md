---
id: "events.off"
title: "GearShell.events.off"
namespace: "events"
kind: "method"
returns: "{ ok, removed }"
sync: true
permissions: ["events.off"]
---

# GearShell.events.off

Remove all handlers for a topic.

## Signature

```js
GearShell.events.off(topic)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | `string` | yes | Topic name. |

## Returns

`{ ok, removed }`

## Examples

### Stop listening

```js
GearShell.events.off("task.status");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "events.off"
  ]
}
```
