---
id: "config.tasks.update"
title: "GearShell.config.tasks.update"
namespace: "config"
kind: "method"
returns: "{ ok, task }"
sync: true
permissions: ["config.tasks.update"]
---

# GearShell.config.tasks.update

Update a saved workspace task

## Signature

```js
GearShell.config.tasks.update(id, task)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Task id. |
| `task` | `TaskRecord` | yes | Replacement task. |

## Returns

Replace the task record by id.

## Examples

### From the shell page

```js
GearShell.config.tasks.update("scratch", { id: "scratch", name: "scratch", cmd: "/bin/zsh" });
```

### From the gear CLI

```js
gear config.tasks.update '["x",{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.tasks.update"
  ]
}
```
