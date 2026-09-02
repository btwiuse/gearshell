---
id: "terminal.offExit"
title: "GearShell.terminal.offExit"
namespace: "terminal"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["terminal.offExit"]
---

# GearShell.terminal.offExit

Unsubscribe a terminal exit handler

## Signature

```js
GearShell.terminal.offExit(id, listener)
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
GearShell.terminal.offExit(id, listener);
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
    "terminal.offExit"
  ]
}
```
