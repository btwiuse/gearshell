---
id: "fs.stat"
title: "GearShell.fs.stat"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.stat

Read the metadata of a path

## Signature

```js
GearShell.fs.stat(path)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path. |

## Returns

`{ path, size, mode, isDirectory, isFile, modTime, raw }` or `null` if the path doesn't exist.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.stat("/opfs/home/notes.md")
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
