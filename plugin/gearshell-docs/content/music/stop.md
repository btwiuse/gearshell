---
id: "music.stop"
title: "GearShell.music.stop"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.stop"]
---

# GearShell.music.stop

Stop and unload the track

## Signature

```js
GearShell.music.stop()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.stop();
```

### From the gear CLI

```js
gear music.stop '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.stop"
  ]
}
```
