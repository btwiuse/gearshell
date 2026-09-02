---
id: "music.next"
title: "GearShell.music.next"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.next"]
---

# GearShell.music.next

Skip to the next track

## Signature

```js
GearShell.music.next()
```

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.next();
```

### From the gear CLI

```js
gear music.next '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.next"
  ]
}
```
