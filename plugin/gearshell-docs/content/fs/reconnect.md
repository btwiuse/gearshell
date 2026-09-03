---
id: "fs.reconnect"
title: "GearShell.fs.reconnect"
namespace: "fs"
kind: "method"
returns: "{ ok: true, ... }"
sync: true
permissions: ["fs.*"]
---

# GearShell.fs.reconnect

Re-pick a stored mount whose permission was revoked

## Signature

```js
GearShell.fs.reconnect(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Stored mount id (from `fs.mounts()`). |

## Returns

`{ ok: true, mount }`. Binds to the same `dst`, replaces the handle.

## Notes

- Iframe plugins opt in to `fs.*` by listing it in `permissions.api`.
- Path sandboxing is delegated to the wanix bind graph — what the plugin can read or write is governed by the bind layout, not by the API.

## Examples

### From the shell page

```js
await GearShell.fs.reconnect(id);
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
