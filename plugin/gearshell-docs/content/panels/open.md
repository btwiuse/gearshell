---
id: "panels.open"
title: "GearShell.panels.open"
namespace: "panels"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["panels.open"]
---

# GearShell.panels.open

Open a panel by component name (or an iframe URL via `browser.open`). The `options` argument controls where the panel docks: `direction`, `group`, `referencePanel`.

## Signature

```js
GearShell.panels.open(component, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `component` | `string` | yes | Panel component name (e.g. `"home"`, `"files"`, `"terminal"`, or a custom iframe component). |
| `options` | `{ group?, referencePanel?, direction? }` | no | Docking options. `direction` is `"left" \| "right" \| "above" \| "below"`; `group` is an existing dockview group id; `referencePanel` is a panel id to split next to. |

## Returns

`{ ok: true, id }` — the new panel's id.

## Examples

### Open Files in a new tab

```js
GearShell.panels.open("files");
```

### Dock Files to the right of the active panel

```js
GearShell.panels.open("files", { direction: "right" });
```

### Open a custom iframe plugin

```js
GearShell.panels.open("iframe:my-plugin", { direction: "below" });
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "panels.open"
  ]
}
```
