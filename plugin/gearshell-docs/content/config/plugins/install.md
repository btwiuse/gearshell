---
id: "config.plugins.install"
title: "GearShell.config.plugins.install"
namespace: "config"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["config.plugins.install"]
---

# GearShell.config.plugins.install

Install a plugin from a manifest

## Signature

```js
GearShell.config.plugins.install(manifest)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `manifest` | `PluginManifest` | yes | Plugin manifest. |

## Returns

Validates and stores the manifest. The plugin boots on next reload.

## Examples

### From the shell page

```js
GearShell.config.plugins.install({ id: "x", name: "X", iframe: { src: "/plugin/x/" } });
```

### From the gear CLI

```js
gear config.plugins.install '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.plugins.install"
  ]
}
```
