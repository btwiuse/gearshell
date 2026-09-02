---
id: "config.terminalProfiles.normalize"
title: "GearShell.config.terminalProfiles.normalize"
namespace: "config"
kind: "method"
returns: "{ ok, profile }"
sync: true
permissions: ["config.terminalProfiles.normalize"]
---

# GearShell.config.terminalProfiles.normalize

Normalize a Console profile without saving it

## Signature

```js
GearShell.config.terminalProfiles.normalize(profile)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `profile` | `ProfileRecord` | yes | Profile to normalize. |

## Returns

Useful in plugin UIs that let the user edit a profile and want to preview the normalized shape.

## Examples

### From the shell page

```js
GearShell.config.terminalProfiles.normalize({ id: "default", name: "Default", cmd: "/bin/bash" });
```

### From the gear CLI

```js
gear config.terminalProfiles.normalize '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalProfiles.normalize"
  ]
}
```
