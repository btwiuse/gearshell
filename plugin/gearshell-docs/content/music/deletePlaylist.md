---
id: "music.deletePlaylist"
title: "GearShell.music.deletePlaylist"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.deletePlaylist"]
---

# GearShell.music.deletePlaylist

Delete a playlist

## Signature

```js
GearShell.music.deletePlaylist(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Playlist id. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.deletePlaylist(id);
```

### From the gear CLI

```js
gear music.deletePlaylist '["playlist-id"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.deletePlaylist"
  ]
}
```
