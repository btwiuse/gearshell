---
id: "fs.readFileText"
title: "GearShell.fs.readFileText"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.readFileText

Read a file as a UTF-8 string

## Signature

```js
GearShell.fs.readFileText(path)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path. |

## Returns

The decoded text content.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.readFileText("/opfs/home/notes.md")
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
