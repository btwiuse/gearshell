---
id: "events.emit"
title: "GearShell.events.emit"
namespace: "events"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["events.emit"]
---

# GearShell.events.emit

Publish an event. The payload is mirrored to the event ring buffer and to `window.CustomEvent` listeners.

## Signature

```js
GearShell.events.emit(topic, payload)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | `string` | yes | Topic name. |
| `payload` | `any` | yes | JSON-serialisable payload. |

## Returns

`{ ok }`

## Examples

### Emit a custom event

```js
GearShell.events.emit("my-plugin.tick", { at: Date.now() });
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "events.emit"
  ]
}
```
