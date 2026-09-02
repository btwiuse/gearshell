---
id: "config.models.remove"
title: "GearShell.config.models.remove"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.models.remove"]
---

# GearShell.config.models.remove

Remove a model from a provider

## Signature

```js
GearShell.config.models.remove(providerId, modelId)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `providerId` | `string` | yes | Provider id. |
| `modelId` | `string` | yes | Model id. |

## Returns

Removes the model entry.

## Examples

### From the shell page

```js
GearShell.config.models.remove({ providerId: "deepseek", modelId: "deepseek-v4-flash" });
```

### From the gear CLI

```js
gear config.models.remove '["x","x"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.models.remove"
  ]
}
```
