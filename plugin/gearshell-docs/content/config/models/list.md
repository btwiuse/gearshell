---
id: "config.models.list"
title: "GearShell.config.models.list"
namespace: "config"
kind: "method"
returns: "{ ok, models }"
sync: true
permissions: ["config.models.list"]
---

# GearShell.config.models.list

List configured models across providers

## Signature

```js
GearShell.config.models.list()
```

## Returns

Returns every configured model.

## Examples

### From the shell page

```js
GearShell.config.models.list().models.forEach(console.log);
```

### From the gear CLI

```js
gear config.models.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.models.list"
  ]
}
```
