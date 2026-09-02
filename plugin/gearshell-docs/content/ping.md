---
id: "ping"
title: "GearShell.ping"
kind: "method"
returns: "string"
sync: true
permissions: ["ping"]
---

# GearShell.ping

Round-trip probe that returns `"pong"`. Use it to verify the GearShell bridge is reachable from an iframe plugin, to test postMessage wiring, or as a no-op health check from the `gear` CLI.

## Signature

```js
GearShell.ping()
```

## Returns

The literal string `"pong"`.

## Notes

- Always synchronous on the shell page (no `await` needed).
- Always asynchronous across the iframe bridge — the bridge resolves the promise after the parent replies.

## Examples

### From the shell page

```js
const reply = GearShell.ping();
// "pong"
```

### From an iframe plugin

Same call, but the bridge postMessage round-trips asynchronously:

```js
const reply = await GearShell.ping();
// "pong"
```

### From the gear CLI

```js
gear ping
# pong
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "ping"
  ]
}
```
