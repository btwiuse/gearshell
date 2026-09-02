---
id: "panels.list"
title: "GearShell.panels.list"
namespace: "panels"
kind: "method"
returns: "{ ok, panels }"
sync: true
permissions: ["panels.list"]
---

# GearShell.panels.list

List every open dockview panel: id, component, title, active, group. Use this to find a panel id before closing or focusing it.

## Signature

```js
GearShell.panels.list()
```

## Returns

`{ ok: true, panels: PanelSummary[] }`. Each summary has `id`, `component`, `title`, `active`, and `group`.

## Examples

### From the shell page

```js
const { panels } = GearShell.panels.list();
panels.forEach(p => console.log(p.id, p.component, p.title));
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "panels.list"
  ]
}
```
