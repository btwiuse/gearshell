---
id: "music.setLoop"
title: "GearShell.music.setLoop"
namespace: "music"
kind: "method"
returns: "{ ok, ... }"
sync: true
permissions: ["music.setLoop"]
---

# GearShell.music.setLoop

Loop mode: off / all / one

## Signature

```js
GearShell.music.setLoop(mode)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"off" | "all" | "one"` | yes | Loop mode. |

## Returns

`{ ok, ... }`

## Examples

### From the shell page

```js
GearShell.music.setLoop("all");
```

### From the gear CLI

```js
gear music.setLoop '["all"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "music.setLoop"
  ]
}
```
