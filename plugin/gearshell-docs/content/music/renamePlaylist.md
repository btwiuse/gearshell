---
id: "music.renamePlaylist"
title: "GearShell.music.renamePlaylist"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.renamePlaylist"]
---

# GearShell.music.renamePlaylist

Rename a playlist

## Signature

```js
GearShell.music.renamePlaylist(id, name)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Playlist id. |
| `name` | `string` | yes | New name. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.renamePlaylist(id, "Deep Work");
```

### From the gear CLI

```js
gear music.renamePlaylist '["playlist-id","Focus"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.renamePlaylist"
  ]
}
```
