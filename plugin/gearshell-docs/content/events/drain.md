---
id: "events.drain"
title: "GearShell.events.drain"
namespace: "events"
kind: "method"
returns: "{ ok, events }"
sync: true
permissions: ["events.drain"]
---

# GearShell.events.drain

Splice the agent event ring buffer. Consumes it — agents rely on this so they don't miss events. The high-water mark is persisted, so events survive reloads.

## Signature

```js
GearShell.events.drain()
```

## Returns

`{ ok, events }`

## Examples

### Drain buffered events

```js
const { events } = GearShell.events.drain();
events.forEach(e => console.log(e.topic, e.payload));
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "events.drain"
  ]
}
```
