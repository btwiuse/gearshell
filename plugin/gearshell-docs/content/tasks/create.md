---
id: "tasks.create"
title: "GearShell.tasks.create"
namespace: "tasks"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["tasks.create"]
---

# GearShell.tasks.create

Create a new workspace task. With `background: true` the task runs headless (no panel); otherwise it opens a terminal panel.

## Signature

```js
GearShell.tasks.create(spec, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spec` | `{ name, cmd, term?, background?, persist? }` | yes | Task spec. `term` selects between terminal-mode (`true`) and headless (`false` or `background: true`). `persist: true` survives reloads. |
| `options` | `{ silent?, autoClose? }` | no | Run options. |

## Returns

`{ ok, id }`

## Examples

### Start a headless background task

```js
const { id } = GearShell.tasks.create({
  name: "scratch",
  cmd: "while true; do date; sleep 1; done",
  background: true,
});
```

### Open an interactive terminal

```js
GearShell.tasks.create({ name: "scratch", cmd: "/bin/bash", term: true });
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "tasks.create"
  ]
}
```
