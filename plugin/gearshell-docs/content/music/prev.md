---
id: "music.prev"
title: "GearShell.music.prev"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.prev"]
---

# GearShell.music.prev

Restart the track or go back

## Signature

```js
GearShell.music.prev()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.prev();
```

### From the gear CLI

```js
gear music.prev '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.prev"
  ]
}
```
