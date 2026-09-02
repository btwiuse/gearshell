---
id: "music.setShuffle"
title: "GearShell.music.setShuffle"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.setShuffle"]
---

# GearShell.music.setShuffle

Toggle random playback order

## Signature

```js
GearShell.music.setShuffle(on)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `on` | `boolean` | yes | Enable shuffle. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.setShuffle(true);
```

### From the gear CLI

```js
gear music.setShuffle '[true]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.setShuffle"
  ]
}
```
