---
id: "fs.watch"
title: "GearShell.fs.watch"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.watch

Watch a /opfs/... directory

## Signature

```js
GearShell.fs.watch(path, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | A `/opfs/...` directory path (or `/opfs` for the root). |
| `options` | `{ recursive?: boolean }` | no | Pass `{ recursive: true }` to watch the whole subtree. |

## Returns

`{ ok: true, id, path, recursive }`. Mutations are delivered as `fs.changed` events (payload `{ path, type, root }`). Requires a Chromium-based runtime with `FileSystemObserver` support.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.watch("/opfs/home/notes", { recursive: true });
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
