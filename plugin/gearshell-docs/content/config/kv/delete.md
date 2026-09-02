---
id: "config.kv.delete"
title: "GearShell.config.kv.delete"
namespace: "config"
kind: "method"
returns: "{ ok, deleted }"
sync: true
permissions: ["config.kv.delete"]
---

# GearShell.config.kv.delete

Remove a key

## Signature

```js
GearShell.config.kv.delete(key)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | The kv key. |

## Returns

Removes the value at the given key. Returns `{ deleted: false }` when absent.

## Examples

### From the shell page

```js
GearShell.config.kv.delete("my-plugin:state");
```

### From the gear CLI

```js
gear config.kv.delete '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.kv.delete"
  ]
}
```
