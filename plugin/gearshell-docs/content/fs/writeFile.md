---
id: "fs.writeFile"
title: "GearShell.fs.writeFile"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.writeFile

Write a Uint8Array (truncates)

## Signature

```js
GearShell.fs.writeFile(path, contents)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path. |
| `contents` | `Uint8Array | number[] | ArrayBuffer` | yes | Bytes to write. |

## Returns

The byte count written.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.writeFile("/opfs/home/notes.md", new TextEncoder().encode("hello\n"));
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
