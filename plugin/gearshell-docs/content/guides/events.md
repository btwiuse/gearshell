---
id: events
title: "Working with the event ring buffer"
kind: guide
---

# Working with the event ring buffer

GearShell has two event surfaces:

1. **In-page pub/sub** (`GearShell.events.on/off/emit`) — synchronous
   topic → handler dispatch, lives in the shell's memory.
2. **Agent ring buffer** (`GearShell.events.drain`) — fire-and-forget
   feed for agents running inside the wanix kernel. Persisted across
   reloads.

## In-page events

```js
const token = GearShell.events.on("task.status", (p) => {
  console.log(p.taskId, p.status);
});

// later
GearShell.events.off("task.status");
```

The same payload is mirrored to `window.CustomEvent` so DOM listeners
can react:

```js
window.addEventListener("task.status", (e) => console.log(e.detail));
```

## The agent ring buffer

The shell writes every task status into the ring buffer. Agents
running inside a wanix task poll it with `gear events.drain` (or read
the buffer count with `gear events.pending`):

```bash
gear events.pending
# {"ok":true,"count":3}

gear events.drain
# {"ok":true,"events":[{"topic":"task.status","payload":{...}}, ...]}
```

`drain` splices the buffer (consumes it). Persisted entries survive
reloads so an agent that restarts doesn't miss events that happened
while it was down.

## Common topics

| Topic | Payload |
|-------|---------|
| `task.status` | `{ taskId, status }` |
| `task.output` | `{ taskId, chunk }` |
| `config.changed` | the patch that was applied |
| `w9y.changed` | `{ id, status }` |
| `panel.opened` / `panel.closed` | `{ id }` |

