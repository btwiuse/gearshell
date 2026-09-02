---
id: "fs.readFile"
title: "GearShell.fs.readFile"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.readFile

Read a file as Uint8Array

## Signature

```js
GearShell.fs.readFile(path)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path (e.g. `/opfs/home/notes.md`). |

## Returns

The file's bytes as a `Uint8Array`. The iframe bridge carries Uint8Array unchanged across postMessage.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.readFile("/opfs/home/notes.md")
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
