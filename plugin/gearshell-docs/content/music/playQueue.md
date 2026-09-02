---
id: "music.playQueue"
title: "GearShell.music.playQueue"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.playQueue"]
---

# GearShell.music.playQueue

Queue a list of tracks and start at startIndex

## Signature

```js
GearShell.music.playQueue(tracks, startIndex)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tracks` | `Track[]` | yes | List of `{ src, title }`. |
| `startIndex` | `number` | no | Index to start at. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.playQueue([{ src: "/opfs/home/a.mp3", title: "A" }, { src: "/opfs/home/b.mp3", title: "B" }]);
```

### From the gear CLI

```js
gear music.playQueue '[[],0]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.playQueue"
  ]
}
```
