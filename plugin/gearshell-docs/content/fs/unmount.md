---
id: "fs.unmount"
title: "GearShell.fs.unmount"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.unmount

Unbind + drop a mount

## Signature

```js
GearShell.fs.unmount(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Stored mount id. |

## Returns

`{ ok: true, id, removed }`. Idempotent — returns `removed: false` for an unknown id.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.unmount(id);
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
