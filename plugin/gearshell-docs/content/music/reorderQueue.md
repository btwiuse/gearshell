---
id: "music.reorderQueue"
title: "GearShell.music.reorderQueue"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.reorderQueue"]
---

# GearShell.music.reorderQueue

Move a queue entry; the playing track stays pinned

## Signature

```js
GearShell.music.reorderQueue(from, to)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from` | `number` | yes | Source index. |
| `to` | `number` | yes | Target index. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.reorderQueue(0, 3);
```

### From the gear CLI

```js
gear music.reorderQueue '[0,0]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.reorderQueue"
  ]
}
```
