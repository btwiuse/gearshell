---
id: "config.updateShell"
title: "GearShell.config.updateShell"
namespace: "config"
kind: "method"
returns: "{ ok, shell }"
sync: true
permissions: ["config.updateShell"]
---

# GearShell.config.updateShell

Merge a patch into the shell config

## Signature

```js
GearShell.config.updateShell(patch)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patch` | `Partial<ShellConfig>` | yes | Object whose keys are shallow-merged into the shell config. |

## Returns

Shallow-merges the patch into the shell config. Every write is audited (`kind: "system"`) and emits a `config.changed` event with the same shape as the patch.

## Examples

### From the shell page

```js
GearShell.config.updateShell({ launcherOrder: ["home", "files"] });
```

### From the gear CLI

```js
gear config.updateShell '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.updateShell"
  ]
}
```
