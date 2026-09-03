---
id: "fs.restoreMounts"
title: "GearShell.fs.restoreMounts"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.restoreMounts

Boot-time silent rebind of every stored mount

## Signature

```js
GearShell.fs.restoreMounts()
```

## Returns

`{ ok: true, mounts }`. Refreshed `mounted` flags; revoked ones stay in the list with `mounted: false`.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.restoreMounts();
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "fs.*"
  ]
}
```
