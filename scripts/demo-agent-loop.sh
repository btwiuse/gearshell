#!/bin/bash
# GearShell agentic-workspace closed-loop demo.
#
# An in-sandbox agent (this bash process) drives the workspace API end
# to end via the gear CLI: create a headless sub-task, poll its output,
# and use the result. Verified in the real browser (2026-08-29):
#
#   [agent] 1/3 create headless sub-task via gear
#   [agent]    create -> {"ok":true,"panelId":"workspace-task-9",...}
#   [agent] 2/3 poll gear tasks.output '[9]'
#   [agent]    output -> result=42\n
#   [agent] 3/3 use the result: verified result=result=42\n
#   [agent] CLOSED LOOP OK
#
# Constraints that shaped this script (hush-shell workspace, minimal
# POSIX-ish image): no sed/awk/jq/seq in /bin, only bash builtins for
# parsing; gear takes a JSON-array args string, so a scalar like the
# session id must be wrapped: tasks.output '[9]' (a bare '9' fails the
# :json spread). Copy to the workspace (e.g. /opfs/home) and run with
# `bash /opfs/home/demo-agent-loop.sh`.
set -u

echo "[agent] 1/3 create headless sub-task via gear"
res=$(gear tasks.create '[{"name":"demo-sub","cmd":"echo result=$((6*7))","term":false}]')
echo "[agent]    create -> $res"
rest=${res#*'"panelId":"workspace-task-'}
panel=${rest%%'"'*}
if [ -z "$panel" ]; then
  echo "[agent]    FAIL: cannot parse panelId from $res" >&2
  exit 1
fi

echo "[agent] 2/3 poll gear tasks.output '[$panel]'"
out=""
for ((i = 0; i < 20; i++)); do
  raw=$(gear tasks.output "[$panel]" 2>/dev/null || true)
  rest=${raw#*'"output":"'}
  out=${rest%%'"'*}
  if [ -n "$out" ] && [ "$out" != "$rest" ]; then
    break
  fi
  sleep 1
done
if [ -z "$out" ]; then
  echo "[agent]    FAIL: sub-task produced no output" >&2
  exit 1
fi

echo "[agent]    output -> $out"
echo "[agent] 3/3 use the result: verified result=$out"
echo "[agent] CLOSED LOOP OK"
