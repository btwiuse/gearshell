---
id: config-audit
title: "Config changes, audit, and undo"
kind: guide
---

# Config changes, audit, and undo

Every write through the `config.*` API is recorded in the audit ring
buffer. The audit log lets you inspect who changed what and undo
specific entries.

## The audit shape

```js
const { entries } = GearShell.config.audit.list();
entries.forEach((e) => {
  console.log(e.id, e.kind, e.agent);
});
```

Each entry has:

| Field | Meaning |
|-------|---------|
| `id` | Audit entry id (use this for `audit.undo`) |
| `kind` | `"shell"`, `"bind"`, `"runtime"`, `"kv"`, `"plugin"`, `"provider"`, `"model"`, ... |
| `agent` | Plugin id that made the change (`"shell"` for shell-originated changes) |
| `patch` | The change itself |
| `snapshot` | The state before the change (used by `audit.undo`) |

## Undo a change

```js
GearShell.config.audit.undo("audit-12345");
```

The undo restores the `snapshot` field as the current state. After an
undo, the page may need a reload for bind/runtime changes to take
effect.

## Clear the ring

```js
GearShell.config.audit.clear();
```

Useful in plugin UIs that show the audit log and want to give the user
a clean slate.

## Reading via the gear CLI

```bash
gear config.audit.list
gear config.audit.undo audit-12345
gear config.audit.clear
```

