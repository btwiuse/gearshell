---
id: "config.tasks.add"
title: "GearShell.config.tasks.add"
namespace: "config"
kind: "method"
returns: "{ ok, task }"
sync: true
permissions: ["config.tasks.add"]
---

# GearShell.config.tasks.add

Add a saved workspace task

## Signature

```js
GearShell.config.tasks.add(task)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | `TaskRecord` | yes | Task record. |

## Returns

Persists a task so it auto-restarts on workspace reload.

## Examples

### From the shell page

```js
GearShell.config.tasks.add({ id: "scratch", name: "scratch", cmd: "/bin/bash", term: true });
```

### From the gear CLI

```js
gear config.tasks.add '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.tasks.add"
  ]
}
```
