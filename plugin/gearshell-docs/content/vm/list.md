---
id: "vm.list"
title: "GearShell.vm.list"
namespace: "vm"
kind: "method"
returns: "{ ok, sessions }"
sync: true
permissions: ["vm.*"]
---

# GearShell.vm.list

List VM sessions hosted by the shell.

## Signature

```js
GearShell.vm.list()
```

## Returns

`{ ok, sessions }`

## Examples

### List VMs

```js
GearShell.vm.list();
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "vm.*"
  ]
}
```
