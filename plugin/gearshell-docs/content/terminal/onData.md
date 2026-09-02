---
id: "terminal.onData"
title: "GearShell.terminal.onData"
namespace: "terminal"
kind: "method"
returns: "{ ok, off }"
sync: true
permissions: ["terminal.onData"]
---

# GearShell.terminal.onData

Subscribe to terminal output

## Signature

```js
GearShell.terminal.onData(id, listener)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |
| `listener` | `(data: string | Uint8Array) => void` | yes | Listener function. |

## Returns

`{ ok, off }`

## Notes

- Subscribing via the bridge from an iframe requires the bridge's local channel (GearShell.subscribe('terminal.<id>.data')); the postMessage round-trip cannot carry function references.

## Examples

### From the shell page

```js
const { id } = GearShell.terminal.create({ cmd: "/bin/bash", term: true });
GearShell.terminal.onData(id, (data) => console.log("output:", data));
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
    "terminal.onData"
  ]
}
```
