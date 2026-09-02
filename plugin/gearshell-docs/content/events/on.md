---
id: "events.on"
title: "GearShell.events.on"
namespace: "events"
kind: "method"
returns: "{ ok, off }"
sync: true
permissions: ["events.on"]
---

# GearShell.events.on

Register an in-page event handler. Returns a token you can pass back to `events.off` to remove the handler.

## Signature

```js
GearShell.events.on(topic, handler)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | `string` | yes | Topic name (e.g. `"task.status"`, `"config.changed"`, `"w9y.changed"`). |
| `handler` | `(payload: any) => void` | yes | Handler function. |

## Returns

`{ ok, off }`

## Notes

- The bridge cannot carry function references across postMessage — iframe plugins must subscribe through the local bridge channel: GearShell.subscribe(topic); GearShell.on(topic, handler);

## Examples

### Listen for task status changes

```js
const { off } = GearShell.events.on("task.status", (p) => console.log("status", p));
// later: off();
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "events.on"
  ]
}
```
