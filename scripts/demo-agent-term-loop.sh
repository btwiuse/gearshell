#!/bin/bash
# GearShell agentic-workspace TERMINAL closed-loop demo.
#
# Like demo-agent-loop.sh (headless), but drives a term:true task
# through its live terminal: the in-sandbox agent creates an
# interactive bash task, injects a command via gear agents.prompt,
# and reads the result back from a shared OPFS file the task wrote.
# This exercises the whole term path: task create, prompt channel,
# shared-fs read-back, wrapTermCmd (`bash -c '<cmd>'`) on the task.
#
# Timing note: every task spawns its own gojs worker, and a cold
# worker compiling bash wasm can take a while before the interactive
# shell consumes the prompted line, so the wait below is 60s + a
# re-prompt + 60s.
#
# Reading files: `$(< file)` is a bash read-file optimization that
# only applies when the command substitution IS exactly `< file`.
# Adding `2>/dev/null || true` turns it into a plain command
# substitution whose body is an empty command with redirects, which
# outputs nothing — this holds in real bash too (verified on macOS).
# Use the builtin `read` and guard the exit code instead.
#
# Constraints (hush-shell workspace, minimal POSIX-ish image): no
# sed/awk/jq/seq/cat in /bin, only bash builtins; gear takes a
# JSON-array args string, so scalars must be wrapped: tasks.output
# '[3]' not '3'. Copy to the workspace (e.g. /opfs/home) and run
# with `bash /opfs/home/demo-agent-term-loop.sh`.
set -u

RESULT=/opfs/home/term-result.txt

echo "[agent] 1/4 create term sub-task via gear"
res=$(gear tasks.create '[{"name":"term-sub","cmd":"bash","term":true}]')
echo "[agent]    create -> $res"
rest=${res#*'"panelId":"workspace-task-'}
panel=${rest%%'"'*}
if [ -z "$panel" ]; then
  echo "[agent]    FAIL: cannot parse panelId from $res" >&2
  exit 1
fi

echo "[agent] 2/4 prompt the task terminal (cold worker may take a while)"
sleep 3
pr=$(gear agents.prompt "[\"task-$panel\",\"echo result=\$((6*7)) > $RESULT\"]")
echo "[agent]    prompt -> $pr"
case "$pr" in
  *'"ok":true'*) ;;
  *) echo "[agent]    FAIL: prompt rejected: $pr" >&2; exit 1 ;;
esac

echo "[agent] 3/4 read the result back from shared OPFS"
out=""
waited=0
for ((attempt = 1; attempt <= 2; attempt++)); do
  while [ "$waited" -lt 60 ]; do
    sleep 1
    waited=$((waited + 1))
    out=""
    read -r out < "$RESULT" 2>/dev/null || true
    if [ -n "$out" ]; then
      break 2
    fi
    if [ $((waited % 20)) -eq 0 ]; then
      echo "[agent]    ...waited ${waited}s for the task result"
    fi
  done
  if [ -z "$out" ] && [ "$attempt" -eq 1 ]; then
    echo "[agent]    retrying prompt (input may have queued before bash was up)"
    pr=$(gear agents.prompt "[\"task-$panel\",\"echo result=\$((6*7)) > $RESULT\"]")
    echo "[agent]    prompt -> $pr"
  fi
done

if [ -z "$out" ]; then
  echo "[agent]    FAIL: no result in $RESULT after ~120s" >&2
  echo "[agent]    The fs IS shared (you can cat the file yourself); the task" >&2
  echo "[agent]    bash was slower to come up than the wait. Check with" >&2
  echo "[agent]    'cat $RESULT' or retry once workers are warm." >&2
  exit 1
fi

echo "[agent]    result -> $out"
echo "[agent] 4/4 verified: result=$out"
echo "[agent] CLOSED LOOP OK (term)"
