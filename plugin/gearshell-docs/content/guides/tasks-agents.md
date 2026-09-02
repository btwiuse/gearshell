---
id: tasks-agents
title: "Tasks vs Agents: when to use which"
kind: guide
---

# Tasks vs Agents: when to use which

GearShell exposes two related concepts that often get conflated:

- **Tasks** (`GearShell.tasks.*`) — long-running workspace processes
  that survive across plugin calls.
- **Agents** (`GearShell.agents.*`) — a thin layer that drives
  terminals (and, by extension, agents running in those terminals).

## Tasks

A task is a single process. It can be:

- `term: true` — runs in a terminal panel (interactive).
- `term: false` — runs headless (no panel).
- `background: true` — explicitly headless even if `term` defaults
  to true.
- `persist: true` — survives reloads.

Use `tasks.create` to start one. Use `tasks.list`, `tasks.cancel`,
`tasks.output` to manage it.

```js
const { id } = GearShell.tasks.create({
  name: "scratch",
  cmd: "while true; do date; sleep 1; done",
  background: true,
});

// later
const { output } = GearShell.tasks.output(id);
GearShell.tasks.cancel(id);
```

## Agents

An agent is a *view* of a task — typically a terminal that an LLM or
a human is driving. Use `agents.list` to enumerate them,
`agents.prompt` to inject text, `agents.read` to snapshot the
scrollback, `agents.interrupt` to send Ctrl+C.

```js
const reply = GearShell.agents.prompt("terminal-1", "npm test\n");
if (reply.busy) {
  // try again after reply.retryAfterMs
}
```

## The connection

When you create a task with `term: true`, the shell auto-creates an
agent entry with the same id (prefixed `task-` or `terminal-`).
`tasks.create` and `agents.list` both see it.

The `agents.*` API is the right surface when you're driving a process
that's already running and you want to read or inject text. The
`tasks.*` API is the right surface when you're orchestrating the
process lifecycle.

