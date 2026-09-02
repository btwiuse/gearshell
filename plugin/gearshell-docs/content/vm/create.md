---
id: "vm.create"
title: "GearShell.vm.create"
namespace: "vm"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["vm.create"]
---

# GearShell.vm.create

Create an iframe VM session. VM plugins normally provide the backend and Linux assets; the host only brokers the iframe and the kernel handle.

## Signature

```js
GearShell.vm.create(config)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `config` | `VMConfig` | yes | VM configuration (memory, disks, kernel, initrd, netdev, ...). |

## Returns

`{ ok, id }`

## Notes

- The exact VM backend is provided by the iframe plugin you have installed (v86, rv64).

## Examples

### Create a 512MB VM

```js
GearShell.vm.create({ memory: "512M", netdev: "" });
```

### From the gear CLI

```js
gear vm.create '[{"memory":"512M"}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "vm.create"
  ]
}
```
