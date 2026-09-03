---
id: "fs.requestLocalDir"
title: "GearShell.fs.requestLocalDir"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.requestLocalDir

Run the FSA picker + bind + persist

## Signature

```js
GearShell.fs.requestLocalDir(name)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | no | Optional display-name override (defaults to the picked directory's name). |

## Returns

`{ ok: true, mount }`. Host-only — the picker must run on the top-level document inside a real user gesture.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.requestLocalDir();
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
