---
id: "version"
title: "GearShell.version"
kind: "value"
returns: "string"
sync: true
permissions: ["version"]
---

# GearShell.version

The GearShell API version constant exposed at the root of the namespace. This is a static string (currently `"0.1.0"`), not a callable — read it as a property. The `gear version` CLI alias maps to `GearShell.ping`, not to this property.

## Signature

```js
// value (string)
GearShell.version
```

## Returns

A version string literal (`"0.1.0"` today). Treat it as informational; semantic versioning is not yet promised across releases.

## Examples

### Read the version from the shell page

```js
console.log(GearShell.version); // "0.1.0"
```

## Required permissions

Declare the matching API paths in the plugin manifest's `permissions.api` array:

```json
{
  "api": [
    "version"
  ]
}
```
