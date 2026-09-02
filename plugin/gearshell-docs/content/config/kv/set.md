---
id: "config.kv.set"
title: "GearShell.config.kv.set"
namespace: "config"
kind: "method"
returns: "{ ok, key }"
sync: true
permissions: ["config.kv.set"]
---

# GearShell.config.kv.set

Upsert a JSON value

## Signature

```js
GearShell.config.kv.set(key, value)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | The kv key. |
| `value` | `any` | yes | Any JSON-serialisable value. |

## Returns

Writes a JSON value at the given key. The write is audited and emits a `config.changed` event.

## Examples

### From the shell page

```js
GearShell.config.kv.set("my-plugin:state", { foo: 1 });
```

### From the gear CLI

```js
gear config.kv.set '["x",{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.kv.set"
  ]
}
```
