---
id: "config.tasks.set"
title: "GearShell.config.tasks.set"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.tasks.set"]
---

# GearShell.config.tasks.set

Replace saved workspace tasks

## Signature

```js
GearShell.config.tasks.set(tasks)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tasks` | `TaskRecord[]` | yes | Replacement tasks. |

## Returns

Replace the entire saved-task list atomically.

## Examples

### From the shell page

```js
GearShell.config.tasks.set([
  { id: "build", name: "build", cmd: "npm run build", term: false, background: true },
]);
```

### From the gear CLI

```js
gear config.tasks.set '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.tasks.set"
  ]
}
```
