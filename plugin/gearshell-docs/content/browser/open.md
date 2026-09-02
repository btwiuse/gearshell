---
id: "browser.open"
title: "GearShell.browser.open"
namespace: "browser"
kind: "method"
returns: "{ ok, id }"
sync: true
permissions: ["browser.open"]
---

# GearShell.browser.open

Open an http(s) URL in an iframe panel. The shell enforces the wanix runtime's `allowOrigins` list; cross-origin requests outside that list are blocked.

## Signature

```js
GearShell.browser.open(url, options)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | `string` | yes | URL. Must start with `http://` or `https://`. |
| `options` | `{ direction? }` | no | Docking options (same shape as `panels.open`). |

## Returns

`{ ok: true, id }` — the new browser panel's id.

## Examples

### Open example.com in a new tab

```js
GearShell.browser.open("https://example.com");
```

### Open it to the right of the active panel

```js
GearShell.browser.open("https://example.com", { direction: "right" });
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "browser.open"
  ]
}
```
