---
id: "tasks.list"
title: "GearShell.tasks.list"
namespace: "tasks"
kind: "method"
returns: "{ ok, tasks }"
sync: true
permissions: ["tasks.list"]
---

# GearShell.tasks.list

List live workspace-task sessions. Each entry has `id`, `name`, `cmd`, `status`, and a `pid` if the task is running.

## Signature

```js
GearShell.tasks.list()
```

## Returns

`{ ok: true, tasks: TaskSummary[] }`.

## Examples

### List running tasks

```js
const { tasks } = GearShell.tasks.list();
console.table(tasks);
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "tasks.list"
  ]
}
```
