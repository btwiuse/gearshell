// gctl-bind.js — the bin/gctl CLI bind + workspace bind boot hook
// (split out of workspace-api.js for the 500-line rule).

import {
  saveWorkspace,
  updateWorkspaceIndex,
} from "./app-workspace.js?v=20260826.26";

// --- The jsfs projection of the API lives at /js/GearShell (kernel
// jsfs roots at globalThis; window.GearShell = api makes the methods
// reachable). The js bind is already part of DEFAULT_SYSTEM_CONFIG; the
// gctl helper below wraps the protocol for shells. ---

// The gctl CLI (Route A). Requires hush >= v0.5.8 for fd>2 + `<>`
// redirections. Uses modern bash syntax ([[ ]], parameter expansion) —
// hush runs scripts with a #!/bin/bash shebang in bash language mode.
// Args are a JSON array of parameters.
export const GCTL_BIND = {
  id: "gctl",
  type: "file",
  dst: "bin/gctl",
  mode: "0755",
  content: [
    "#!/bin/bash",
    "# gctl: GearShell workspace control (jsfs fd bridge).",
    "# usage: gctl <method.dotted.path> [json-args-array]",
    "# Bashisms ([[ ]], parameter expansion) are fine: hush runs scripts",
    "# with a #!/bin/bash shebang in bash language mode.",
    "set -u",
    "if [[ $# -lt 1 ]]; then",
    '  echo "usage: gctl <method.dotted.path> [json-args-array]" >&2',
    "  exit 2",
    "fi",
    'method="$1"',
    'args="${2:-[]}"',
    "# `gctl open <file|url>`: http(s) URLs open a browser iframe panel;",
    "# anything else is resolved against $PWD (the task ns) and opened as",
    "# a file in the file browser with a preview.",
    "if [[ $method == open ]]; then",
    '  _target="$args"',
    '  [[ -n $_target ]] || { echo "usage: gctl open <file|url>" >&2; exit 2; }',
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
    'exec 3<>"$path" 2>/dev/null || { echo "gctl: cannot open $path" >&2; exit 1; }',
    'echo "$args" >&3 || { echo "gctl: call failed" >&2; exit 1; }',
    "# mvdan.cc/sh's read builtin exits 1 when the line has no trailing",
    "# newline (the jsfs funcfile result is newline-less), so gate on the",
    "# variable instead of the exit status. A failed invoke (e.g. args not",
    "# a JSON array) surfaces here as an empty read.",
    'read -r out <&3 || [[ -n ${out:-} ]] || { echo "gctl: no response (args must be a JSON array)" >&2; exit 1; }',
    "exec 3<&-",
    'printf "%s\\n" "$out"',
    "",
  ].join("\n"),
};

// --- Boot hooks ---
// Ensure the active workspace carries the /js projection bind (needed for
// the gctl protocol; normally part of DEFAULT_SYSTEM_CONFIG) and the gctl
// CLI. Must run BEFORE the wanix namespace is built (app.js calls this
// right after loadActiveWorkspace()), because binds are baked into the
// namespace at construction. Idempotent by bind dst; the gctl CLI content
// is REFRESHED when the protocol changes (e.g. the jsfs `:json` suffix),
// so saved workspaces pick up fixes without manual edits.
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
  const gctlIndex = workspace.system.binds.findIndex(
    (item) => item.dst === "bin/gctl",
  );
  if (gctlIndex === -1) {
    workspace.system.binds.push({ ...GCTL_BIND });
    changed = true;
  } else if (workspace.system.binds[gctlIndex].content !== GCTL_BIND.content) {
    workspace.system.binds[gctlIndex] = { ...GCTL_BIND };
    changed = true;
  }
  if (!changed) return;
  try {
    saveWorkspace(workspace);
    updateWorkspaceIndex(workspace);
  } catch {
    // workspace store may be mid-migration; in-place mutation still covers
    // this session's namespace build
  }
}
