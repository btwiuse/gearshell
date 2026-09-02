---
id: "config.kv.get"
title: "GearShell.config.kv.get"
namespace: "config"
kind: "method"
returns: "{ ok, value? }"
sync: true
permissions: ["config.kv.get"]
---

# GearShell.config.kv.get

Read a per-workspace JSON value by key

## Signature

```js
GearShell.config.kv.get(key)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | The kv key. |

## Returns

Reads any JSON value stored in the active workspace's kv store. Returns `{ ok: true, value: undefined }` when the key is absent.

## Examples

### From the shell page

```js
const state = GearShell.config.kv.get("my-plugin:state");
```

### From the gear CLI

```js
gear config.kv.get '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.kv.get"
  ]
}
```
