---
id: "terminal.onExit"
title: "GearShell.terminal.onExit"
namespace: "terminal"
kind: "method"
returns: "{ ok, off }"
sync: true
permissions: ["terminal.onExit"]
---

# GearShell.terminal.onExit

Subscribe to terminal exit events

## Signature

```js
GearShell.terminal.onExit(id, listener)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `listener` | `(code: number) => void` | yes | Listener function. |

## Returns

`{ ok, off }`

## Notes

- Subscribing via the bridge from an iframe requires the bridge's local channel (GearShell.subscribe('terminal.<id>.data')); the postMessage round-trip cannot carry function references.

## Examples

### From the shell page

```js
GearShell.terminal.onExit(id, (code) => console.log("exit", code));
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
    "terminal.onExit"
  ]
}
```
