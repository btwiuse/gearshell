---
id: "tasks.output"
title: "GearShell.tasks.output"
namespace: "tasks"
kind: "method"
returns: "{ ok, output }"
sync: true
permissions: ["tasks.output"]
---

# GearShell.tasks.output

Read the captured output of a headless task. Terminal tasks (interactive) refuse this call.

## Signature

```js
GearShell.tasks.output(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Task id. |

## Returns

`{ ok, output }`

## Examples

### Read headless task output

```js
const { output } = GearShell.tasks.output("task-1");
console.log(output);
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "tasks.output"
  ]
}
```
