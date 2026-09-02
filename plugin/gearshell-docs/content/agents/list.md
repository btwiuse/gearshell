---
id: "agents.list"
title: "GearShell.agents.list"
namespace: "agents"
kind: "method"
returns: "{ ok, sessions }"
sync: true
permissions: ["agents.list"]
---

# GearShell.agents.list

List live terminal + task sessions (id prefix: `terminal-` / `task-`).

## Signature

```js
GearShell.agents.list()
```

## Returns

`{ ok, sessions }`

## Examples

### List agent sessions

```js
const { sessions } = GearShell.agents.list();
sessions.forEach(s => console.log(s.id, s.kind));
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "agents.list"
  ]
}
```
