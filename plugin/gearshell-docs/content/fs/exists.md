---
id: "fs.exists"
title: "GearShell.fs.exists"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.exists

Does the path exist?

## Signature

```js
GearShell.fs.exists(path)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path. |

## Returns

`{ ok: true, path, exists }`. Returns `{ exists: false }` for ENOENT, throws for real I/O errors.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.exists("/opfs/home/notes.md")
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
