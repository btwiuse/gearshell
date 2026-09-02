---
id: gear-cli
title: "Calling the API from the gear CLI"
kind: guide
---

# Calling the API from the gear CLI

The `gear` CLI is a thin bash wrapper over the `/js/GearShell/*` jsfs
mount. It lives at `/bin/gear` inside every agent task namespace, so
any agent (or human running `hush`/`bash` in a terminal) can call the
API without writing JavaScript.

## The protocol

```bash
# exec a function file with fd 3, write the JSON args, read the JSON reply
exec 3<>/js/GearShell/<method>:json
echo '[<args-json>]' >&3
cat <&3
```

`gear` does this in one line:

```bash
gear <method.dotted.path> '<json-args-array>'
```

## Examples

```bash
# Probe
gear ping

# List open panels
gear panels.list

# Create a background task
gear tasks.create '[{"name":"probe","cmd":"echo hi","background":true}]'

# Patch the shell config
gear config.updateShell '[{"launcherOrder":["home","files"]}]'

# Read system binds
gear config.getSystem

# Add a bind
gear config.addBind '[{"id":"tools","type":"ns","dst":"tools","src":"#ramfs/new"}]'

# Patch the runtime pin
gear config.updateRuntime '[{"allowOrigins":"https://example.com"}]'

# Reload the workspace
gear config.reload

# Inject a prompt into a live terminal
gear agents.prompt '["terminal-1","ls -la"]'

# Snapshot terminal scrollback
gear agents.read '["terminal-1",{"rows":50}]'

# Open a URL in an iframe panel
gear open https://example.com
```

## `agents.prompt-wait`

The jsfs bridge is synchronous, so `agents.prompt` returns
`{ busy: true, retryAfterMs: N }` while a previous command is still
running. The `gear` CLI wraps this with `agents.prompt-wait` that
retries until the prompt lands or a timeout elapses (default 30s):

```bash
gear agents.prompt-wait terminal-1 "npm test" 60
```

## Errors

The jsfs funcfile surfaces a thrown error as a failed read with no
message, so every bridged method catches and returns `{ ok: false, error }`.
`gear` surfaces the `error` field:

```bash
$ gear tasks.cancel task-does-not-exist
{"ok":false,"error":"task not found"}
```

## Reload-required changes

Binds, runtime, and workspace changes only take effect after a reload.
Pattern: `gear config.updateX '...'` followed by `gear config.reload`.

