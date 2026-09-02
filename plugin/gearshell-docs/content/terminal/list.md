---
id: "terminal.list"
title: "GearShell.terminal.list"
namespace: "terminal"
kind: "method"
returns: "{ ok, sessions }"
sync: true
permissions: ["terminal.list"]
---

# GearShell.terminal.list

List live terminal and VM bridge sessions

## Signature

```js
GearShell.terminal.list()
```

## Returns

`{ ok, sessions }`

## Examples

### From the shell page

```js
GearShell.terminal.list();
```

### From the gear CLI (write only)

```js
gear terminal.write '["terminal-1","ls\\n"]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "terminal.list"
  ]
}
```
