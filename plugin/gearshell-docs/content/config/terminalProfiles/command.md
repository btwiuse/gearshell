---
id: "config.terminalProfiles.command"
title: "GearShell.config.terminalProfiles.command"
namespace: "config"
kind: "method"
returns: "{ ok, command }"
sync: true
permissions: ["config.terminalProfiles.command"]
---

# GearShell.config.terminalProfiles.command

Build the command specification for a Console profile

## Signature

```js
GearShell.config.terminalProfiles.command(profile)
```

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `profile` | `ProfileRecord` | yes | Profile to resolve. |

## Returns

Returns the resolved `{ cmd, args, env }` triple that the terminal layer would actually exec.

## Examples

### From the shell page

```js
GearShell.config.terminalProfiles.command({ id: "default", name: "Default", cmd: "/bin/bash" });
```

### From the gear CLI

```js
gear config.terminalProfiles.command '[{}]'
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "config.terminalProfiles.command"
  ]
}
```
