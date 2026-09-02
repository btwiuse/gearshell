---
id: "fs.unwatch"
title: "GearShell.fs.unwatch"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.unwatch

Dispose a watcher

## Signature

```js
GearShell.fs.unwatch(handle)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `handle` | `object` | yes | The full handle object returned by `fs.watch`. |

## Returns

`{ ok: true, id, removed }`. Idempotent — calling twice returns `removed: false` on the second call.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.unwatch(handle);
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
