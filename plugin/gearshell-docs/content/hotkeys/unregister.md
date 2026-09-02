---
id: "hotkeys.unregister"
title: "GearShell.hotkeys.unregister"
namespace: "hotkeys"
kind: "method"
returns: "{ ok: true }"
sync: true
permissions: ["hotkeys.unregister"]
---

# GearShell.hotkeys.unregister

Remove a previously registered hotkey by id. Plugin-owned hotkeys can only be removed by their registering plugin (or by the shell).

## Signature

```js
GearShell.hotkeys.unregister(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | The hotkey id returned by `register`. |

## Returns

`{ ok: true }`

## Examples

### Remove a hotkey

```js
GearShell.hotkeys.unregister("ctrl+shift+p");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "hotkeys.unregister"
  ]
}
```
