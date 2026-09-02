---
id: "fs.writeFileText"
title: "GearShell.fs.writeFileText"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.writeFileText

Write a UTF-8 string (truncates)

## Signature

```js
GearShell.fs.writeFileText(path, text)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path. |
| `text` | `string` | yes | Text to write. |

## Returns

The byte count written.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.writeFileText("/opfs/home/notes.md", "hello\n");
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
