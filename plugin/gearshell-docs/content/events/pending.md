---
id: "events.pending"
title: "GearShell.events.pending"
namespace: "events"
kind: "method"
returns: "{ ok, count }"
sync: true
permissions: ["events.pending"]
---

# GearShell.events.pending

How many events are buffered for agents. Cheap read; use it to decide whether to `drain`.

## Signature

```js
GearShell.events.pending()
```

## Returns

`{ ok, count }`

## Examples

### Read the buffer size

```js
const { count } = GearShell.events.pending();
if (count > 0) GearShell.events.drain();
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "events.pending"
  ]
}
```
