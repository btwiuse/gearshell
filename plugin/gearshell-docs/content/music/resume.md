---
id: "music.resume"
title: "GearShell.music.resume"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.resume"]
---

# GearShell.music.resume

Resume playback

## Signature

```js
GearShell.music.resume()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.resume();
```

### From the gear CLI

```js
gear music.resume '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.resume"
  ]
}
```
