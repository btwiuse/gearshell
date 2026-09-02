---
id: "config.kv.list"
title: "GearShell.config.kv.list"
namespace: "config"
kind: "method"
returns: "{ ok, keys }"
sync: true
permissions: ["config.kv.list"]
---

# GearShell.config.kv.list

List kv keys (optionally filtered by prefix)

## Signature

```js
GearShell.config.kv.list(prefix)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | `string` | no | Prefix filter. |

## Returns

Returns every key in the active workspace's kv store, sorted.

## Examples

### From the shell page

```js
GearShell.config.kv.list("my-plugin:").keys.forEach(console.log);
```

### From the gear CLI

```js
gear config.kv.list '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.kv.list"
  ]
}
```
