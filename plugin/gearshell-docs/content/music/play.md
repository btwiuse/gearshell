---
id: "music.play"
title: "GearShell.music.play"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.play"]
---

# GearShell.music.play

Replace the queue with one track and play it

## Signature

```js
GearShell.music.play(src, title)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `src` | `string` | yes | URL or VFS path. |
| `title` | `string` | no | Display title. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.play("https://example.com/song.mp3", "Song");
```

### From the gear CLI

```js
gear music.play '["https://example.com/song.mp3","Song"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.play"
  ]
}
```
