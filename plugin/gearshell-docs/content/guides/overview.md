---
id: overview
title: "GearShell API overview"
kind: guide
---

# GearShell API overview

GearShell exposes a single root object on the shell page: `window.GearShell`.
The same object is the bridge target for iframe plugins and the source of
the `/js/GearShell/<method>:json` jsfs mount agents use to drive the shell
from inside their namespaces.

## At a glance

| Surface | Used by | Shape |
|---------|---------|-------|
| `window.GearShell` | in-page JS, iframe bridge | nested object, sync (bridge is async) |
| `/js/GearShell/*` jsfs | agents inside a wanix task | file reads/writes; sync |
| `gear <method> '<json-args>'` | agents, humans in a terminal | wrapper over the jsfs mount |

The jsfs surface is the *source of truth* — every method on
`window.GearShell` is also callable from an agent via
`exec 3<>/js/GearShell/<method>:json; echo '[...]' >&3; cat <&3`. The
`gear` CLI is just sugar around that protocol.

## Synchrony

In-page calls are synchronous; calls across the iframe bridge are
`async` because the bridge proxies through `postMessage`. The jsfs
mount is synchronous by design — the kernel reads the result line
immediately after the write.

If you write code that runs both on the shell page and inside an iframe,
always `await` the result; on the shell page the promise resolves
synchronously, in the iframe it round-trips through the parent.

## Permissions

Iframe plugins opt in to API paths via the manifest's
`permissions.api` whitelist. The shell rejects calls to paths not in
the whitelist with `{ ok: false, error: "permission denied: <path>" }`.

The playground plugin manifest declares every permission path so the
Explorer tab can call any method. Most plugins should declare only what
they use.

