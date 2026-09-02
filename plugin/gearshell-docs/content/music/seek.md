---
id: "music.seek"
title: "GearShell.music.seek"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.seek"]
---

# GearShell.music.seek

Seek the loaded track

## Signature

```js
GearShell.music.seek(seconds)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `seconds` | `number` | yes | Position in seconds. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.seek(42);
```

### From the gear CLI

```js
gear music.seek '[0]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.seek"
  ]
}
```
