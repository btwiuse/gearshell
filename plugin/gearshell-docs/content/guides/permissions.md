---
id: permissions
title: "Permissions & capability gating"
kind: guide
---

# Permissions & capability gating

The GearShell API is gated by a per-plugin permission list. The shell
rejects every call to a path not declared in the plugin's manifest.

## In manifests

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "iframe": { "src": "/plugin/my-plugin/index.html" },
  "permissions": {
    "api": [
      "panels.list",
      "panels.open",
      "music.nowPlaying",
      "config.kv.get",
      "config.kv.set",
      "events.on",
      "events.off"
    ]
  }
}
```

## Wildcards

You can grant an entire namespace with a trailing `*`:

```json
"permissions": { "api": ["music.*", "panels.*"] }
```

The shell expands the wildcard against the actual method list at call
time, so adding new methods to a namespace does not silently grant
them — only the explicitly listed paths work.

## Why no global root permission

There is intentionally no `"*` grant. The shell's audit log tracks
which plugin made each call, and a careless root grant would erase
that accountability.

## What the bridge rejects

A denied call returns:

```js
{ ok: false, error: "permission denied: config.reset" }
```

The shell's console also logs the rejection so a plugin developer can
see which path was blocked.

## Plugin-owned hotkeys

Hotkeys registered by an iframe plugin are owned by that plugin —
removing the plugin revokes the hotkey. `hotkeys.unregister` only
removes hotkeys owned by the calling plugin.

