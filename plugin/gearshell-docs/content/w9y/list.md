---
id: "w9y.list"
title: "GearShell.w9y.list"
namespace: "w9y"
kind: "method"
returns: "{ ok, packages }"
sync: true
permissions: ["w9y.list"]
---

# GearShell.w9y.list

List installed w9y packages. The registry is mirrored in-memory from `/opfs/wanix/w9y-registry.json`.

## Signature

```js
GearShell.w9y.list()
```

## Returns

`{ ok, packages }`

## Examples

### List installed mods

```js
const { packages } = GearShell.w9y.list();
console.table(packages);
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "w9y.list"
  ]
}
```
