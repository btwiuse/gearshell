---
id: "music.loadPlaylist"
title: "GearShell.music.loadPlaylist"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.loadPlaylist"]
---

# GearShell.music.loadPlaylist

Load a playlist into the queue

## Signature

```js
GearShell.music.loadPlaylist(id)
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
GearShell.music.loadPlaylist(id);
```

### From the gear CLI

```js
gear music.loadPlaylist '["playlist-id"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.loadPlaylist"
  ]
}
```
