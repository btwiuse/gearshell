---
id: "config.terminalIcons.list"
title: "GearShell.config.terminalIcons.list"
namespace: "config"
kind: "method"
returns: "{ ok, icons }"
sync: true
permissions: ["config.terminalIcons.list"]
---

# GearShell.config.terminalIcons.list

List icons available for Console profiles

## Signature

```js
GearShell.config.terminalIcons.list()
```

## Returns

Returns every icon record (lucide name + label).

## Examples

### From the shell page

```js
GearShell.config.terminalIcons.list().icons.slice(0, 5);
```

### From the gear CLI

```js
gear config.terminalIcons.list '[]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalIcons.list"
  ]
}
```
