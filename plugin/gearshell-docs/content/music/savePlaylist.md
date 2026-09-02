---
id: "music.savePlaylist"
title: "GearShell.music.savePlaylist"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.savePlaylist"]
---

# GearShell.music.savePlaylist

Save the queue (or explicit tracks) under a name

## Signature

```js
GearShell.music.savePlaylist(name, tracks)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | yes | Playlist name. |
| `tracks` | `Track[]` | no | Optional explicit tracks; defaults to the current queue. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.savePlaylist("Focus");
```

### From the gear CLI

```js
gear music.savePlaylist '["Focus",[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.savePlaylist"
  ]
}
```
