---
id: "hotkeys.list"
title: "GearShell.hotkeys.list"
namespace: "hotkeys"
kind: "method"
returns: "Array<HotkeyRecord>"
sync: true
permissions: ["hotkeys.*"]
---

# GearShell.hotkeys.list

List every registered shell hotkey, including the source that registered it (`shell`, `plugin:<id>`, or `api`). Hotkeys are keyboard shortcuts that drive shell actions (`panels.open`, `overlay.toggle`, etc).

## Signature

```js
GearShell.hotkeys.list()
```

## Returns

An array of hotkey records. Each record carries the chord, the action it triggers, and the registration source.

## Examples

### Inspect the registered hotkeys

```js
const hotkeys = GearShell.hotkeys.list();
console.table(hotkeys);
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "hotkeys.*"
  ]
}
```
