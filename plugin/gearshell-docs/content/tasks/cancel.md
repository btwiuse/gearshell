---
id: "tasks.cancel"
title: "GearShell.tasks.cancel"
namespace: "tasks"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["tasks.cancel"]
---

# GearShell.tasks.cancel

Kill a running task and close its panel.

## Signature

```js
GearShell.tasks.cancel(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Task id. |

## Returns

`{ ok, id }`

## Examples

### Cancel a running task

```js
GearShell.tasks.cancel("task-1");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "tasks.cancel"
  ]
}
```
