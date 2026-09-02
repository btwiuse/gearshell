---
id: "config.tasks.remove"
title: "GearShell.config.tasks.remove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.tasks.remove"]
---

# GearShell.config.tasks.remove

Remove a saved workspace task

## Signature

```js
GearShell.config.tasks.remove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Task id. |

## Returns

Removes the task from the saved catalog.

## Examples

### From the shell page

```js
GearShell.config.tasks.remove("scratch");
```

### From the gear CLI

```js
gear config.tasks.remove '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.tasks.remove"
  ]
}
```
