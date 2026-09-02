---
id: "files.open"
title: "GearShell.files.open"
namespace: "files"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["files.open"]
---

# GearShell.files.open

Reveal a VFS path in the Files panel. If the panel isn't open yet, it opens; if it is, it navigates to the path.

## Signature

```js
GearShell.files.open(path, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | yes | VFS path, e.g. `"/opfs/home/notes.md"`. |
| `options` | `{ direction? }` | no | Docking options. |

## Returns

`{ ok, id }`

## Examples

### Open notes.md in Files

```js
GearShell.files.open("/opfs/home/notes.md");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "files.open"
  ]
}
```
