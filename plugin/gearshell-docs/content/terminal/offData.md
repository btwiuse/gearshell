---
id: "terminal.offData"
title: "GearShell.terminal.offData"
namespace: "terminal"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["terminal.offData"]
---

# GearShell.terminal.offData

Unsubscribe a terminal output handler

## Signature

```js
GearShell.terminal.offData(id, listener)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `listener` | `function` | yes | Listener to remove. |

## Returns

`{ ok }`

## Notes

- Subscribing via the bridge from an iframe requires the bridge's local channel (GearShell.subscribe('terminal.<id>.data')); the postMessage round-trip cannot carry function references.

## Examples

### From the shell page

```js
GearShell.terminal.offData(id, listener);
```

### From the gear CLI (write only)

```js
gear terminal.write '["terminal-1","ls\\n"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "terminal.offData"
  ]
}
```
