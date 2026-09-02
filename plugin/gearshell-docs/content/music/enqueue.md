---
id: "music.enqueue"
title: "GearShell.music.enqueue"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.enqueue"]
---

# GearShell.music.enqueue

Append tracks to the queue

## Signature

```js
GearShell.music.enqueue(tracks)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tracks` | `Track[]` | yes | Tracks to append. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.enqueue([{ src: "/opfs/home/c.mp3", title: "C" }]);
```

### From the gear CLI

```js
gear music.enqueue '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.enqueue"
  ]
}
```
