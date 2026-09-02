---
id: "terminal.create"
title: "GearShell.terminal.create"
namespace: "terminal"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["terminal.create"]
---

# GearShell.terminal.create

Create a terminal session for an iframe or same-page terminal client

## Signature

```js
GearShell.terminal.create(profile)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `profile` | `ProfileSpec` | yes | Terminal profile. Pass `{ cmd: "/bin/bash", term: true }` for an interactive shell. |

## Returns

`{ ok, id }`

## Examples

### From the shell page

```js
GearShell.terminal.create({ cmd: "/bin/bash", term: true });
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
    "terminal.create"
  ]
}
```
