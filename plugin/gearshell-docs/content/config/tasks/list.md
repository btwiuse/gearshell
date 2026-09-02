---
id: "config.tasks.list"
title: "GearShell.config.tasks.list"
namespace: "config"
kind: "method"
returns: "{ ok, tasks }"
sync: true
permissions: ["config.tasks.list"]
---

# GearShell.config.tasks.list

List saved workspace tasks

## Signature

```js
GearShell.config.tasks.list()
```

## Returns

Returns every saved task.

## Examples

### From the shell page

```js
GearShell.config.tasks.list().tasks.forEach(console.log);
```

### From the gear CLI

```js
gear config.tasks.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.tasks.list"
  ]
}
```
