---
id: "config.terminalProfiles.save"
title: "GearShell.config.terminalProfiles.save"
namespace: "config"
kind: "method"
returns: "{ ok }"
sync: true
permissions: ["config.terminalProfiles.save"]
---

# GearShell.config.terminalProfiles.save

Save Console profiles

## Signature

```js
GearShell.config.terminalProfiles.save(profiles)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `profiles` | `ProfileRecord[]` | yes | Profiles to save. |

## Returns

Persist the full profile array.

## Examples

### From the shell page

```js
GearShell.config.terminalProfiles.save([
  { id: "default", name: "Default", cmd: "/bin/bash" },
]);
```

### From the gear CLI

```js
gear config.terminalProfiles.save '[[]]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalProfiles.save"
  ]
}
```
