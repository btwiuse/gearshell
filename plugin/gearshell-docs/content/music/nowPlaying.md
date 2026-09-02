---
id: "music.nowPlaying"
title: "GearShell.music.nowPlaying"
namespace: "music"
kind: "method"
returns: "{ ok, src, title, position, duration, loop, shuffle, playing, queue }"
sync: true
permissions: ["music.nowPlaying"]
---

# GearShell.music.nowPlaying

Full playback snapshot

## Signature

```js
GearShell.music.nowPlaying()
```

## Returns

`{ ok, src, title, position, duration, loop, shuffle, playing, queue }`

## Examples

### From the shell page

```js
GearShell.music.nowPlaying();
```

### From the gear CLI

```js
gear music.nowPlaying '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.nowPlaying"
  ]
}
```
