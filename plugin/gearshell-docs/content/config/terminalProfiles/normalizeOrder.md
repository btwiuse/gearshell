---
id: "config.terminalProfiles.normalizeOrder"
title: "GearShell.config.terminalProfiles.normalizeOrder"
namespace: "config"
kind: "method"
returns: "{ ok, order }"
sync: true
permissions: ["config.terminalProfiles.normalizeOrder"]
---

# GearShell.config.terminalProfiles.normalizeOrder

Normalize Console profile ordering

## Signature

```js
GearShell.config.terminalProfiles.normalizeOrder(order)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order` | `string[]` | yes | Profile ids. |

## Returns

Returns the profile order after deduplication and defaulting.

## Examples

### From the shell page

```js
GearShell.config.terminalProfiles.normalizeOrder(["default", "ssh"]);
```

### From the gear CLI

```js
gear config.terminalProfiles.normalizeOrder '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalProfiles.normalizeOrder"
  ]
}
```
