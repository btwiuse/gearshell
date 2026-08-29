# cmd/gear — the gear CLI in Go

Candidate replacement for the bash `bin/gear` CLI (see `gear-bind.js`).
Same jsfs fd-bridge wire protocol, cobra/fang command layer. It does NOT
replace the bash version yet — both are valid at `bin/gear`; promote only
after the wasm bridge spike passes.

## Why

- Kills the fragile parts of the bash script: `_ge_json_escape` + nested
  quote JSON construction, and the hush >= v0.5.8 (`<>` fd redirection,
  fd>2, bash language mode) coupling. Go does JSON natively and needs no
  shell features.
- Protocol logic is unit-testable on the host (`go test`) with a swapped
  `callFn` bridge — the bash version has no tests at all.
- First btwiuse first-party module on the w9y wasm pipeline: hush, w9y and
  the wanix kernel already ship from `w9y.io/go/...@v` (see
  `app-constants.js`), so gear joins an existing distribution path, not a
  new one.

## Build / test

    cd cmd/gear
    go test ./...
    go build -o gear .
    GOOS=wasip1 GOARCH=wasm go build -o gear.wasm .

## Protocol

`gear <method.dotted.path> '<json-args-array>'` opens
`/js/GearShell/<method/path>:json` O_RDWR (root overridable via
`GEAR_JSFS_ROOT`), writes the args array, reads the response back. This is
the identical wire protocol the bash bind uses (`exec 3<>"$path"`, write,
read), so either binary can sit at `bin/gear` without touching the kernel.

## Sugar (mirrors the bash CLI)

- `gear open <file|url>` — http(s) → `browser.open`; otherwise resolve
  against `$PWD` (symlinks evaluated) → `files.open`
- `gear version` — alias for `ping`
- `gear agents.prompt-wait <id> <text> [timeout-secs]` — poll
  `agents.prompt` until the response carries `"ok":true` or the timeout
  elapses (default 30s)

Exit codes match bash: 2 for usage errors, 1 for call failures. `help`,
`--help`, `-h`, `man` and `--version` come from cobra/fang.

## Wiring plan (when promoted)

1. Tag the nested module: `git tag cmd/gear/v0.0.1`
2. Publish a w9y mod (mirror `w9y/mods/hush.mod`):

       module gear
       version v0.0.1
       gear  github.com/btwiuse/gearshell/cmd/gear

3. Fetch URL: `https://w9y.io/go/github.com/btwiuse/gearshell/cmd/gear@v0.0.1`
4. In the sandbox, keep `GEAR_BIND.dst` at `bin/gear` but swap the content
   for a bind that fetches + runs the wasm (same shape as the hush/w9y task
   binds in `app-constants.js`)
5. Keep the bash bind as fallback until the wasm path is proven in the
   browser (see the open question below).

## Open question / spike

Can a Go wasm binary inside a task namespace do the synchronous
open-write-read on the `:json` funcfile through the wanix wasm host bridge?
The kernel jsfs never awaits (the `terminal.embed` constraint), so the
round-trip must stay synchronous end to end. hush does fd-level jsfs ops
over the same bridge, so it is likely fine — verify in the browser before
promoting. Native fallback for local debugging: point `GEAR_JSFS_ROOT` at a
mock directory tree.
