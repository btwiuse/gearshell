---
id: "music.pause"
title: "GearShell.music.pause"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.pause"]
---

# GearShell.music.pause

Pause playback

## Signature

```js
GearShell.music.pause()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.pause();
```

### From the gear CLI

```js
gear music.pause '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.pause"
  ]
}
```
