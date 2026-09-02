---
id: "agents.interrupt"
title: "GearShell.agents.interrupt"
namespace: "agents"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["agents.interrupt"]
---

# GearShell.agents.interrupt

Send Ctrl+C to a live session.

## Signature

```js
GearShell.agents.interrupt(id)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes | Session id. |

## Returns

`{ ok }`

## Examples

### Interrupt a session

```js
GearShell.agents.interrupt("terminal-1");
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "agents.interrupt"
  ]
}
```
