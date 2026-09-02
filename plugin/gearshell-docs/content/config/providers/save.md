---
id: "config.providers.save"
title: "GearShell.config.providers.save"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.providers.save"]
---

# GearShell.config.providers.save

Upsert a provider

## Signature

```js
GearShell.config.providers.save(provider)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider` | `ProviderRecord` | yes | Provider record. |

## Returns

Adds or updates a provider. Pass an empty `apiKey` to keep the stored key.

## Examples

### From the shell page

```js
GearShell.config.providers.save({ id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", apiKey: "sk-...", models: ["gpt-4o"], enabled: true });
```

### From the gear CLI

```js
gear config.providers.save '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.providers.save"
  ]
}
```
