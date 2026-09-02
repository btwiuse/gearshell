---
id: "config.updateRuntime"
title: "GearShell.config.updateRuntime"
namespace: "config"
kind: "method"
returns: "{ ok, runtime }"
sync: true
permissions: ["config.updateRuntime"]
---

# GearShell.config.updateRuntime

Patch the wanix runtime pin + allowOrigins

## Signature

```js
GearShell.config.updateRuntime(patch)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patch` | `Partial<RuntimeRecord>` | yes | Patch object. |

## Returns

Shallow-merges a patch into the runtime pin. Pass `{ allowOrigins: "https://example.com" }` to widen (or narrow) the iframe `allow-same-origin` set. Reload to apply.

## Examples

### From the shell page

```js
GearShell.config.updateRuntime({ allowOrigins: "https://example.com" });
GearShell.config.reload();
```

### From the gear CLI

```js
gear config.updateRuntime '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.updateRuntime"
  ]
}
```
