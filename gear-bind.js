// gear-bind.js — the bin/gear CLI bind + workspace bind boot hook
// (split out of workspace-api.js for the 500-line rule).

import {
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.165";
import { TASK_SHELL_BINDS } from "./app-constants.js?v=20260828.124";

// --- The jsfs projection of the API lives at /js/GearShell (kernel
// jsfs roots at globalThis; window.GearShell = api makes the methods
// reachable). The js bind is already part of DEFAULT_SYSTEM_CONFIG; the
// gear helper below wraps the protocol for shells. ---

// The gear CLI (Route A). Requires hush >= v0.5.8 for fd>2 + `<>`
// redirections. Uses modern bash syntax ([[ ]], parameter expansion) —
// hush runs scripts with a #!/bin/bash shebang in bash language mode.
// Args are a JSON array of parameters.
export const GEAR_BIND = {
  id: "gear",
  type: "file",
  dst: "bin/gear",
  perm: "0755",
  content: [
    "#!/bin/bash",
    "# gear: GearShell workspace control (jsfs fd bridge).",
    "# usage: gear <method.dotted.path> [json-args-array]",
    "# Bashisms ([[ ]], parameter expansion) are fine: hush runs scripts",
    "# with a #!/bin/bash shebang in bash language mode.",
    "set -u",
    "if [[ $# -lt 1 ]]; then",
    '  echo "usage: gear <method.dotted.path> [json-args-array] (try: gear help)" >&2',
    "  exit 2",
    "fi",
    'method="$1"',
    'args="${2:-[]}"',
    "if [[ $method == help || $method == --help || $method == -h ]]; then",
    "  cat <<'HELP' >&2",
    "gear <method> '<json-args-array>' - GearShell workspace control (jsfs fd bridge)",
    "",
    "methods:",
    "  ping",
    "  config.getShell   config.updateShell   config.getWorkspace   config.getSystem   config.getTaskBinds",
    "  config.getBinds   config.addBind   config.updateBind   config.removeBind   config.setBinds",
    "  config.updateRuntime   config.reload",
    "  config.providers.list  config.providers.save  config.providers.remove",
    "  config.plugins.list  config.plugins.install  config.plugins.remove  config.plugins.setEnabled",
    "  config.audit.list  config.audit.undo  config.audit.clear",
    "  panels.list  panels.open  panels.close  panels.focus",
    "  browser.open  files.open",
    "  tasks.list  tasks.create  tasks.cancel  tasks.output",
    "  agents.list  agents.prompt  agents.read  agents.interrupt",
    "  music.play  music.pause  music.resume  music.stop  music.nowPlaying",
    "  events.on  events.off  events.emit  events.drain  events.pending",
    "  open <file|url>",
    "",
    "examples:",
    "  gear ping",
    "  gear panels.list",
    '  gear tasks.create \'[{"name":"x","cmd":"echo hi"}]\'',
    '  gear config.updateShell \'[{"foo":"bar"}]\'',
    "  gear config.getSystem",
    '  gear config.updateBind \'["opfs",{"type":"ns","dst":"opfs","src":"#web/opfs","mode":"0755"}]\'',
    "  gear config.removeBind '[\"tmp\"]'",
    '  gear config.setBinds \'[{"id":"root","type":"ns","dst":".","src":"#ramfs/new"},{"id":"task","type":"ns","dst":"task","src":"#task"}]\'',
    '  gear config.updateRuntime \'[{"allowOrigins":"https://example.com"}]\'',
    '  gear agents.read \'["task-1",{"rows":50}]\'',
    "  gear open https://example.com",
    "",
    "note: system bind/runtime changes only apply on reload;",
    "gear config.reload restarts the workspace (kills all tasks).",
    "provider apiKeys are redacted from every gear response;",
    "config.providers.save with an empty apiKey keeps the stored key.",
    "HELP",
    "  exit 0",
    "fi",
    "if [[ $method == version ]]; then",
    "  method=ping",
    "  args='[]'",
    "fi",
    "# `gear agents.prompt-wait <session-id> <text> [timeout-secs]`: the",
    "# jsfs bridge is synchronous, so agents.prompt answers {busy,",
    "# retryAfterMs} while terminal output is still landing. This sugar",
    "# retries until ok or the timeout elapses (default 30s).",
    "_ge_json_escape() {",
    '  local _s="$1" _c',
    '  _out=""',
    "  while [[ -n $_s ]]; do",
    '    _c="${_s:0:1}"',
    '    case "$_c" in',
    "      '\\'|'\"') _out+=\"\\\\$_c\";;",
    '      *) _out+="$_c";;',
    "    esac",
    '    _s="${_s:1}"',
    "  done",
    "  printf '%s' \"$_out\"",
    "}",
    "if [[ $method == agents.prompt-wait ]]; then",
    '  _target_id="${2:-}"',
    '  _target_text="${3:-}"',
    '  _timeout="${4:-30}"',
    '  [[ -n $_target_id ]] || { echo "usage: gear agents.prompt-wait <session-id> <text> [timeout-secs]" >&2; exit 2; }',
    "  _max_ms=$(( _timeout * 1000 ))",
    "  _waited=0",
    "  method=agents.prompt",
    "  while :; do",
    '    _escaped_text="$(_ge_json_escape "$_target_text")"',
    '    _result="$(gear agents.prompt "[\\"$_target_id\\",\\"$_escaped_text\\"]")"',
    "    [[ $_result == *'\"ok\":true'* ]] && { printf '%s\\n' \"$_result\"; exit 0; }",
    "    [[ $_waited -ge $_max_ms ]] && { printf '%s\\n' \"$_result\"; exit 1; }",
    "    sleep 1",
    "    _waited=$(( _waited + 1000 ))",
    "  done",
    "fi",
    "# `gear open <file|url>`: http(s) URLs open a browser iframe panel;",
    "# anything else is resolved against $PWD (the task ns) and opened as",
    "# a file in the file browser with a preview.",
    "if [[ $method == open ]]; then",
    '  _target="$args"',
    '  [[ -n $_target ]] || { echo "usage: gear open <file|url>" >&2; exit 2; }',
    "  if [[ $_target == http://* || $_target == https://* ]]; then",
    "    method=browser.open",
    '    args="[\\"$_target\\"]"',
    "  else",
    "    if [[ $_target == /* ]]; then",
    "      :",
    "    else",
    '      _dir="${_target%/*}"; _name="${_target##*/}"',
    '      [[ $_dir == "$_target" ]] && _dir=.',
    '      _dir="$(cd "$_dir" 2>/dev/null && pwd -P)" || _dir=""',
    '      _target="${_dir:+$_dir/}$_name"',
    "    fi",
    "    method=files.open",
    '    args="[\\"$_target\\"]"',
    "  fi",
    "fi",
    '# dotted method -> jsfs path segments. mvdan.cc/sh joins "$*" with',
    "# IFS only when it is the sole content of a quoted string (assignment",
    '# and embedded contexts space-join), so build the path with a "$@" loop.',
    '_ifs="$IFS"',
    "IFS=.",
    "set -- $method",
    'IFS="$_ifs"',
    'path="/js/GearShell"',
    'for _seg in "$@"; do',
    '  path="$path/$_seg"',
    "done",
    "# jsfs synthetic view suffixes use ':' (:json), not '.json' — a dot",
    "# would be treated as part of the object key and silently create a",
    "# bogus property on GearShell (web/jsfs helpers.go parseSuffixSegment).",
    'path="$path:json"',
    'exec 3<>"$path" 2>/dev/null || { echo "gear: cannot open $path" >&2; exit 1; }',
    'echo "$args" >&3 || { echo "gear: call failed" >&2; exit 1; }',
    "# mvdan.cc/sh's read builtin exits 1 when the line has no trailing",
    "# newline (the jsfs funcfile result is newline-less), so gate on the",
    "# variable instead of the exit status. A failed invoke (e.g. args not",
    "# a JSON array) surfaces here as an empty read.",
    'read -r out <&3 || [[ -n ${out:-} ]] || { echo "gear: no response (args must be a JSON array)" >&2; exit 1; }',
    "exec 3<&-",
    'printf "%s\\n" "$out"',
    "",
  ].join("\n"),
};

// --- Boot hooks ---
// Ensure the active workspace carries (1) the /js projection bind (needed
// for the gear protocol; normally part of DEFAULT_SYSTEM_CONFIG) in the
// system namespace, and (2) the per-task structural parents (/bin + /preset
// ramfs) in workspace.binds. The tool binaries themselves (bash/w9y/gear)
// and the rc file now come from the `shell-tools` plugin via
// app-plugin-binds.js; this function only prunes the legacy kernel-managed
// tool binds so old workspaces migrate cleanly. The shell tools must NOT
// live in the system namespace: the VM guest mounts the root at / via 9p,
// and host-side wasm tools would leak into the x86 guest where they cannot
// run. workspace.binds are bound into each task's own namespace (the
// crushrc per-task pattern), so terminal/workspace tasks keep bash/w9y/gear
// while the guest root stays clean. Must run BEFORE the wanix namespace is
// built (app.js calls this right after loadActiveWorkspace()), because
// binds are baked into the namespace at construction. Idempotent by bind
// dst; also migrates legacy workspaces that still carry the shell binds at
// system level.
// Ensure the per-task shell parents live in workspace.binds (not the
// system namespace), refreshing perm/src so binds saved with the legacy
// `mode` field get upgraded, and pruning the kernel tool binds the
// shell-tools plugin now provides. Returns true when anything changed.
function ensureTaskShellBinds(workspace) {
  workspace.binds = workspace.binds || [];
  let changed = false;
  // Drop the old per-task /profile location; the rc file now rides the
  // per-task /preset ramfs at preset/profile.
  const withoutOldProfile = workspace.binds.filter((item) =>
    item.dst !== "profile"
  );
  if (withoutOldProfile.length !== workspace.binds.length) {
    workspace.binds = withoutOldProfile;
    changed = true;
  }
  for (const bind of TASK_SHELL_BINDS) {
    const index = workspace.binds.findIndex((item) => item.dst === bind.dst);
    if (index === -1) {
      workspace.binds.push({ ...bind });
      changed = true;
    } else if (
      workspace.binds[index].perm !== bind.perm ||
      workspace.binds[index].src !== bind.src ||
      workspace.binds[index].content !== bind.content
    ) {
      workspace.binds[index] = { ...bind };
      changed = true;
    }
  }
  // Legacy name for the CLI bind: drop any saved `bin/gctl` so old
  // workspaces migrate to the renamed bin/gear (its content is refreshed
  // below regardless).
  // The tool binaries + rc file moved out of the kernel into the
  // `shell-tools` plugin (app-plugin-manifests.js): prune the kernel-
  // managed tool binds (old task-bash/task-w9y/task-profile, the bash
  // `gear` script, and the renamed legacy bin/gctl) so they do not fight
  // the plugin's declarations for the same dst. Prune by id only — a
  // plugin-provided bind has its own plugin-* id and must survive.
  const legacyToolBindIds = new Set([
    "task-bash",
    "task-w9y",
    "task-profile",
    "gear",
    "bin/gctl",
  ]);
  const withoutLegacyTools = workspace.binds.filter(
    (item) => !legacyToolBindIds.has(item.id) && item.dst !== "bin/gctl",
  );
  if (withoutLegacyTools.length !== workspace.binds.length) {
    workspace.binds = withoutLegacyTools;
    changed = true;
  }
  return changed;
}

export function ensureGearShellBinds(workspace) {
  if (!workspace?.system) return;
  let changed = false;
  if (!workspace.system.binds.some((item) => item.dst === "js")) {
    workspace.system.binds.push({
      id: "js",
      type: "ns",
      dst: "js",
      src: "#js",
    });
    changed = true;
  }
  // Migrate away from the old root-level shell binds (incl. /profile);
  // both the current (bin/gear) and legacy (bin/gctl) CLI names are
  // dropped from the system namespace — the CLI rides per-task binds.
  const rootLevelDsts = new Set([
    "bin",
    "bin/bash",
    "bin/w9y",
    "bin/gear",
    "bin/gctl",
    "profile",
  ]);
  const nextSystem = workspace.system.binds.filter(
    (item) => !rootLevelDsts.has(item.dst),
  );
  if (nextSystem.length !== workspace.system.binds.length) {
    workspace.system.binds = nextSystem;
    changed = true;
  }
  if (ensureTaskShellBinds(workspace)) changed = true;
  if (!changed) return;
  try {
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  } catch {
    // workspace store may be mid-migration; in-place mutation still covers
    // this session's namespace build
  }
}
