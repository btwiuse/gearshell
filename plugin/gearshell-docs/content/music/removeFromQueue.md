---
id: "music.removeFromQueue"
title: "GearShell.music.removeFromQueue"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.removeFromQueue"]
---

# GearShell.music.removeFromQueue

Remove a queue entry by index

## Signature

```js
GearShell.music.removeFromQueue(index)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `index` | `number` | yes | Index to remove. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.removeFromQueue(2);
```

### From the gear CLI

```js
gear music.removeFromQueue '[0]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.removeFromQueue"
  ]
}
```
