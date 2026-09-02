---
id: "music.clearQueue"
title: "GearShell.music.clearQueue"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.clearQueue"]
---

# GearShell.music.clearQueue

Empty the queue (keeps playing)

## Signature

```js
GearShell.music.clearQueue()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.clearQueue();
```

### From the gear CLI

```js
gear music.clearQueue '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.clearQueue"
  ]
}
```
