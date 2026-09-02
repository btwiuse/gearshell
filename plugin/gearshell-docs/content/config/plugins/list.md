---
id: "config.plugins.list"
title: "GearShell.config.plugins.list"
namespace: "config"
kind: "method"
returns: "{ ok, plugins }"
sync: true
permissions: ["config.plugins.list"]
---

# GearShell.config.plugins.list

List installed plugins and enabled state

## Signature

```js
GearShell.config.plugins.list()
```

## Returns

Returns every installed plugin manifest plus its `enabled` flag.

## Examples

### From the shell page

```js
GearShell.config.plugins.list().plugins.forEach(p => console.log(p.id, p.enabled));
```

### From the gear CLI

```js
gear config.plugins.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.plugins.list"
  ]
}
```
