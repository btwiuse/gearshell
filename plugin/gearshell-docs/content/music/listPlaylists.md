---
id: "music.listPlaylists"
title: "GearShell.music.listPlaylists"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.listPlaylists"]
---

# GearShell.music.listPlaylists

List named playlists

## Signature

```js
GearShell.music.listPlaylists()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.listPlaylists();
```

### From the gear CLI

```js
gear music.listPlaylists '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.listPlaylists"
  ]
}
```
