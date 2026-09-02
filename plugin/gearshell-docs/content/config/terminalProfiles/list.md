---
id: "config.terminalProfiles.list"
title: "GearShell.config.terminalProfiles.list"
namespace: "config"
kind: "method"
returns: "{ ok, profiles }"
sync: true
permissions: ["config.terminalProfiles.list"]
---

# GearShell.config.terminalProfiles.list

List normalized Console profiles

## Signature

```js
GearShell.config.terminalProfiles.list()
```

## Returns

Returns every profile after normalization.

## Examples

### From the shell page

```js
GearShell.config.terminalProfiles.list().profiles.forEach(console.log);
```

### From the gear CLI

```js
gear config.terminalProfiles.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalProfiles.list"
  ]
}
```
