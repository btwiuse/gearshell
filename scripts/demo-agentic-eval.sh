#!/bin/bash
# demo-agentic-eval.sh — GearShell agentic-workspace eval regression.
#
# Covers eval items in one in-sandbox run:
#   #1  interact loop   prompt -> task terminal -> agents.read sees it
#   #3  events read     events.drain returns config.changed / task.status
#   #4  ephemeral       tasks.create does not persist to workspace tasks
#   #8  audit undo      config.updateShell -> audit entry -> undo restores
# (A3 gctl help / A4 agents.prompt-wait are exercised along the way.)
#
# Run inside the sandbox (mirror /bin has no jq/sed/awk, bash builtins
# only): copy to /opfs/home and run `bash /opfs/home/demo-agentic-eval.sh`.
# The term-task step spawns a gojs worker; a cold compile can take a
# minute, so prompt-wait retries with a generous window.
set -u

PASS=0
FAIL=0
RESULT=/opfs/home/eval-term.txt

pass() { echo "[eval] PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "[eval] FAIL  $1 ($2)" >&2; FAIL=$((FAIL + 1)); }

# First occurrence of a string-valued key in JSON (no jq in the image).
str_field() { # $1=json $2=key
  local json="$1" key="$2"
  json="${json#*\"$key\"}"
  json="${json#*:}"
  json="${json#*\"}"
  echo "${json%%\"*}"
}

# First occurrence of a boolean-valued key in JSON.
bool_field() { # $1=json $2=key
  local json="$1" key="$2"
  json="${json#*\"$key\":}"
  case "$json" in
    true*) echo true ;;
    false*) echo false ;;
    *) echo "" ;;
  esac
}

# Extract the workspace "tasks" array with balanced-bracket counting
# (the object also carries volatile fields like updatedAt that change on
# unrelated saves; only the persisted task list is the #4 assertion).
extract_tasks() { # $1=workspace json
  local json="$1" rest depth i c
  rest="${json#*\"tasks\":}"
  [ "$rest" = "$json" ] && { echo ""; return; }
  depth=0
  for ((i = 0; i < ${#rest}; i++)); do
    c="${rest:i:1}"
    case "$c" in
      '[') depth=$((depth + 1)) ;;
      ']') depth=$((depth - 1))
        if [ "$depth" -eq 0 ]; then echo "${rest:0:$((i + 1))}"; return; fi
        ;;
    esac
  done
  echo ""
}

# --- preflight: channel alive + A3 help ---
ping=$(gctl ping)
case "$ping" in
  '"pong"') pass "channel alive (gctl ping)" ;;
  *) fail "channel alive" "$ping" ;;
esac
gctl help >/dev/null 2>&1 && pass "gctl help lists methods (A3)" ||
  fail "gctl help" "help did not exit 0"

# --- #8 config audit + undo ---
before=$(gctl config.getShell)
cur_wagi=$(bool_field "$before" wagiDogEnabled)
if [ "$cur_wagi" = "true" ]; then patch='{"wagiDogEnabled":false}'; else patch='{"wagiDogEnabled":true}'; fi
upd=$(gctl config.updateShell "[$patch]")
echo "[eval]      updateShell -> $upd"
audit=$(gctl config.audit.list)
audit_id=$(str_field "$audit" id)
case "$audit_id" in
  a*) ;;
  *) fail "#8 audit entry" "no id in $audit" ;;
esac
after=$(gctl config.getShell)
if [ "$after" != "$before" ]; then
  undo=$(gctl config.audit.undo "[\"$audit_id\"]")
  echo "[eval]      undo -> $undo"
  restored=$(gctl config.getShell)
  if [ "$restored" = "$before" ]; then
    pass "#8 audit undo restores exact config"
  else
    fail "#8 audit undo" "config differs after undo"
  fi
  undo2=$(gctl config.audit.undo "[\"$audit_id\"]")
  case "$undo2" in
    *'"ok":false'*) pass "#8 double-undo rejected" ;;
    *) fail "#8 double-undo" "$undo2" ;;
  esac
else
  fail "#8 audit entry" "updateShell did not change config"
fi

# --- #3 events read (updateShell + undo both pushed config.changed) ---
drained=$(gctl events.drain)
echo "[eval]      events.drain -> ${drained:0:200}"
case "$drained" in
  *'"topic":"config.changed"'*) pass "#3 events.drain sees config.changed" ;;
  *) fail "#3 events.drain" "no config.changed in drain" ;;
esac

# --- #4 ephemeral task lifecycle (no workspace persistence) ---
ws_before=$(gctl config.getWorkspace)
tasks_before=$(extract_tasks "$ws_before")
created=$(gctl tasks.create '[{"name":"eval-ephemeral","cmd":"echo eval-done","term":false}]')
echo "[eval]      tasks.create -> $created"
# tasks.create returns a UUID taskDefinition id; the API / gctl numeric
# session id comes from the panelId (workspace-task-N).
panel_id=$(str_field "$created" panelId)
task_id="${panel_id#workspace-task-}"
if [ -n "$task_id" ]; then
  ws_after=$(gctl config.getWorkspace)
  tasks_after=$(extract_tasks "$ws_after")
  if [ "$tasks_after" = "$tasks_before" ]; then
    pass "#4 ephemeral task not persisted to workspace"
  else
    fail "#4 ephemeral" "workspace tasks grew after create ($tasks_before -> $tasks_after)"
  fi
  # tasks.output should surface the headless result (poller, 800ms)
  got_output=""
  for ((i = 0; i < 15; i++)); do
    sleep 1
    out=$(gctl tasks.output "[$task_id]")
    case "$out" in
      *"eval-done"*) got_output="$out"; break ;;
    esac
  done
  if [ -n "$got_output" ]; then
    pass "#3/#4 tasks.output reads headless result"
  else
    fail "#4 tasks.output" "${got_output:-no output after 15s}"
  fi
  gctl tasks.cancel "[$task_id]" >/dev/null 2>&1
  listed=$(gctl tasks.list)
  case "$listed" in
    *"\"id\":$task_id"*) fail "#4 cancel" "task still listed" ;;
    *) pass "#4 cancel removes task from list" ;;
  esac
else
  fail "#4 ephemeral" "no taskId in $created"
fi

# --- #1 interact loop: term task + prompt-wait + agents.read ---
rm -f "$RESULT"
created=$(gctl tasks.create '[{"name":"eval-term","cmd":"bash","term":true}]')
term_panel=$(str_field "$created" panelId)
tid="${term_panel#workspace-task-}"
echo "[eval]      term task panelId -> $term_panel"
# A cold gojs worker takes 30-60s to compile bash before it can consume
# input; a prompt injected into that window is swallowed (the idle gate
# passes because nothing has been written yet). Wait for the visible
# prompt before prompting.
ready=""
last_read=""
for ((i = 0; i < 30; i++)); do
  rd=$(gctl agents.read "[\"task-$tid\",{\"rows\":10}]")
  last_read="$rd"
  case "$rd" in
    *"➜"*) ready="yes"; break ;;
  esac
  sleep 6
done
if [ -z "$ready" ]; then
  echo "[eval]      last read: ${last_read:0:200}"
fi
delivered=""
if [ -n "$ready" ]; then
  for ((attempt = 1; attempt <= 4; attempt++)); do
    pr=$(gctl agents.prompt-wait "task-$tid" "echo EVAL_TERM_OK > $RESULT" 30)
    case "$pr" in
      *'"ok":true'*) delivered="yes"; break ;;
      *) echo "[eval]      prompt-wait attempt $attempt -> $pr" ;;
    esac
    sleep 5
  done
else
  echo "[eval]      no bash prompt in 80s, skipping prompt"
fi
if [ -n "$delivered" ]; then
  found=""
  for ((i = 0; i < 40; i++)); do
    line=""
    read -r line < "$RESULT" 2>/dev/null || true
    if [ "$line" = "EVAL_TERM_OK" ]; then found="yes"; break; fi
    sleep 2
  done
  if [ -n "$found" ]; then
    pass "#1 interact loop (prompt -> task -> OPFS readback)"
  else
    fail "#1 interact loop" "no EVAL_TERM_OK in $RESULT"
  fi
  rd=$(gctl agents.read "[\"task-$tid\",{\"rows\":50}]")
  case "$rd" in
    *"EVAL_TERM_OK"*) pass "#1 agents.read sees prompt output" ;;
    *) fail "#1 agents.read" "$rd" ;;
  esac
else
  fail "#1 interact loop" "prompt-wait never delivered"
fi
gctl tasks.cancel "[\"$tid\"]" >/dev/null 2>&1

echo "[eval] ======================="
echo "[eval] PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
