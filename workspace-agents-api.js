// workspace-agents-api.js — terminal agents namespace (list/prompt/read/
// interrupt) plus the prompt-delivery machinery (idle + human gates,
// serialized injection). Split out of workspace-api.js for the 500-line
// rule. Sessions are shared maps from app-state; the entry module wraps
// agentsApi with safe().

import {
  terminalSessions,
  workspaceTaskSessions,
} from "./app-state.js";

function listAgents() {
  // Session ids are prefixed so terminal and workspace-task counters
  // (both start at 1) can never collide.
  const out = [];
  for (const session of terminalSessions.values()) {
    out.push({
      id: `terminal-${session.id}`,
      kind: "terminal",
      profile: session.profile?.name ?? null,
      status: session.status || "created",
    });
  }
  for (const session of workspaceTaskSessions.values()) {
    out.push({
      id: `task-${session.id}`,
      kind: "task",
      profile: session.taskDefinition?.cmd ?? null,
      status: session.status || "created",
    });
  }
  return out;
}

function promptSession(id, text, options = {}) {
  const session = resolveSession(id);
  const term = session?.term?._term;
  if (!term) {
    return { ok: false, error: "session has no live terminal" };
  }
  ensureTermActivityTracking(session);
  // Idle gate: never inject while output is still landing, so a prompt
  // cannot interleave with a running command — and an agent cannot
  // spin, re-injecting into the tail of its own last command. The
  // caller (agent) is expected to retry after retryAfterMs.
  const idleMs = Date.now() - session._termOutputAt;
  if (idleMs < PROMPT_IDLE_MS) {
    return {
      ok: false,
      error: `terminal busy (last output ${idleMs}ms ago)`,
      busy: true,
      retryAfterMs: PROMPT_IDLE_MS - idleMs,
    };
  }
  // Human-collision gate: refuse to inject into a terminal a human
  // typed in recently (an agent loop hijacking a live human session
  // was a demonstrated failure mode). force: true overrides for
  // explicit drive flows.
  if (
    options.force !== true &&
    Date.now() - session._termHumanInputAt < HUMAN_INPUT_GRACE_MS
  ) {
    return {
      ok: false,
      error: "session has recent human input",
      humanActive: true,
    };
  }
  enqueuePrompt(session, String(text) + "\r");
  return { ok: true };
}

// Read the session terminal's scrollback as plain text (xterm buffer
// cells via translateToString, so no escape sequences — those were
// consumed by xterm's parser). Snapshot semantics: what is currently
// on screen / in the bounded scrollback, capped to the last `rows`
// lines. For lossless full transcripts use a headless task +
// tasks.output instead.
function readSession(id, options = {}) {
  const session = resolveSession(id);
  const term = session?.term?._term;
  if (!term) {
    return { ok: false, error: "session has no live terminal" };
  }
  const buffer = term.buffer?.active;
  if (!buffer) {
    return { ok: false, error: "terminal buffer not available" };
  }
  const rows = Math.max(1, Math.min(Number(options?.rows) || 100, 2000));
  const start = Math.max(0, buffer.length - rows);
  const lines = [];
  for (let y = start; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    lines.push(line ? line.translateToString(true) : "");
  }
  return {
    ok: true,
    id,
    rows: lines.length,
    lines,
    text: lines.join("\n"),
  };
}

function interruptSession(id) {
  const session = resolveSession(id);
  if (!session?.term?._term) {
    return { ok: false, error: "session has no live terminal" };
  }
  session.term._term.input("\u0003");
  return { ok: true };
}

function resolveSession(id) {
  if (typeof id === "string" && id.startsWith("task-")) {
    return workspaceTaskSessions.get(Number(id.slice(5)));
  }
  if (typeof id === "string" && id.startsWith("terminal-")) {
    return terminalSessions.get(Number(id.slice("terminal-".length)));
  }
  return terminalSessions.get(id);
}

// --- Terminal activity tracking + prompt delivery ---
// agents.prompt must not interleave with running output or hijack a
// terminal a human is using. Both gates rely on xterm events attached
// lazily (one-time) to the session's terminal:
//   - onWriteParsed fires when output lands in the buffer -> last output.
//   - onKey fires for REAL keyboard input only (programmatic input()
//     goes through onData, not onKey) -> last human keystroke.
// Tracked on the session object so it survives alongside the session.
const PROMPT_IDLE_MS = 1200;
const HUMAN_INPUT_GRACE_MS = 5000;
const PROMPT_DELIVERY_GAP_MS = 60;

function ensureTermActivityTracking(session) {
  const term = session.term?._term;
  if (!term) return;
  // The wanix-term element recreates its xterm when a panel re-attaches,
  // orphaning listeners attached to the previous instance. Key on the
  // xterm identity, not a one-time flag, so tracking re-binds after the
  // swap instead of silently going dead.
  if (session._termTrackingXterm === term) return;
  session._termTrackingXterm = term;
  if (session._termOutputAt == null) session._termOutputAt = 0;
  if (session._termHumanInputAt == null) session._termHumanInputAt = 0;
  term.onWriteParsed?.(() => {
    session._termOutputAt = Date.now();
  });
  term.onKey?.(() => {
    session._termHumanInputAt = Date.now();
  });
}

// Serialize prompt delivery per session: xterm's input() is unreliable
// under rapid-fire writes, so each prompt waits for the previous one to
// settle (PROMPT_DELIVERY_GAP_MS) before being injected. The API stays
// synchronous (fire-and-forget); ordering is what the agent needs.
function enqueuePrompt(session, textWithReturn) {
  const chain = session._promptChain || Promise.resolve();
  session._promptChain = chain
    .then(
      () =>
        new Promise((resolve) => {
          try {
            session.term?._term?.input(textWithReturn);
          } catch {
            // terminal gone; drop this delivery
          }
          setTimeout(resolve, PROMPT_DELIVERY_GAP_MS);
        }),
    )
    .catch(() => {});
  return session._promptChain;
}

export const agentsApi = {
  list: listAgents,
  prompt: promptSession,
  read: readSession,
  interrupt: interruptSession,
};
