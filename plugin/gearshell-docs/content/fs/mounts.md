---
id: "fs.mounts"
title: "GearShell.fs.mounts"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.mounts

List persisted local directory mounts

## Signature

```js
GearShell.fs.mounts()
```

## Returns

`{ ok: true, mounts }` — metadata-only (no handles); each entry has `id`, `name`, `dst`, `mode`, `mounted`, `permission`.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.mounts();
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
