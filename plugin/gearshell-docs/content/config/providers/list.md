---
id: "config.providers.list"
title: "GearShell.config.providers.list"
namespace: "config"
kind: "method"
returns: "{ ok, providers }"
sync: true
permissions: ["config.providers.list"]
---

# GearShell.config.providers.list

List model providers

## Signature

```js
GearShell.config.providers.list()
```

## Returns

Returns every provider. `apiKey` is replaced with `hasApiKey: boolean` to avoid leaking secrets.

## Examples

### From the shell page

```js
GearShell.config.providers.list().providers.forEach(console.log);
```

### From the gear CLI

```js
gear config.providers.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.providers.list"
  ]
}
```
