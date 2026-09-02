---
id: "config.providers.remove"
title: "GearShell.config.providers.remove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.providers.remove"]
---

# GearShell.config.providers.remove

Delete a provider by id

## Signature

```js
GearShell.config.providers.remove(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Provider id. |

## Returns

Removes the provider and its model entries.

## Examples

### From the shell page

```js
GearShell.config.providers.remove("openai");
```

### From the gear CLI

```js
gear config.providers.remove '["x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.providers.remove"
  ]
}
```
