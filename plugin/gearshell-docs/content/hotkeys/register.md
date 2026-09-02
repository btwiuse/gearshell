---
id: "hotkeys.register"
title: "GearShell.hotkeys.register"
namespace: "hotkeys"
kind: "method"
returns: "{ ok: true, id }"
sync: true
permissions: ["hotkeys.register"]
---

# GearShell.hotkeys.register

Register a new hotkey from a trusted caller. The action must be one of the shell's recognised action shapes (e.g. `{ method: "panels.open", args: ["launcher"] }` or `{ method: "overlay.toggle", args: ["spotlight"] }`).

## Signature

```js
GearShell.hotkeys.register(spec)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spec` | `{ key: string, action: ActionSpec, label?: string }` | yes | Hotkey descriptor. `key` is a chord like `"ctrl+shift+p"` (modifier names: `ctrl`/`shift`/`alt`/`meta`). `action` is an object with `method` and `args`. |

## Returns

`{ ok: true, id }` on success. The `id` is derived from the chord so re-registering the same key overwrites the previous action.

## Notes

- Only `panels.open` and `overlay.toggle` actions are accepted by the API gate. To trigger a custom action, drive it from a plugin entry module instead.
- Use the `gear` CLI's `agents.prompt` to drive an interactive prompt without registering a hotkey.

## Examples

### Open Spotlight on Ctrl+Shift+P

```js
GearShell.hotkeys.register({
  key: "ctrl+shift+p",
  action: { method: "overlay.toggle", args: ["spotlight"] },
  label: "Open Spotlight",
});
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "hotkeys.register"
  ]
}
```
