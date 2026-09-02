---
id: "config.models.save"
title: "GearShell.config.models.save"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.models.save"]
---

# GearShell.config.models.save

Add or update a model under an existing provider

## Signature

```js
GearShell.config.models.save(model)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `model` | `ModelRecord` | yes | Model record. |

## Returns

Adds or updates a model entry.

## Examples

### From the shell page

```js
GearShell.config.models.save({ providerId: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, defaultMaxTokens: 163840, canReason: true, supportsImages: false });
```

### From the gear CLI

```js
gear config.models.save '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.models.save"
  ]
}
```
