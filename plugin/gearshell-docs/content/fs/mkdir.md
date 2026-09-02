---
id: "fs.mkdir"
title: "GearShell.fs.mkdir"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.mkdir

Create a directory

## Signature

```js
GearShell.fs.mkdir(path)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | Directory path. |

## Returns

`{ ok: true, path }`.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
GearShell.fs.mkdir("/opfs/home/projects")
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
