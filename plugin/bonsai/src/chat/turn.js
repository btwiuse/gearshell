// Single chat turn: build the user / assistant DOM nodes, drive the
// stream-event consumer, and finalize the turn. Caller hands in the
// shared DOM roots (cThread, cLive, cInput, setStatus) and the
// streaming primitives (scheduleStreamPaint, cancelStreamPaint,
// appendTurnMeta, appendToolCallCard, renderAnswer, updateLiveStat).
//
// This module owns the per-turn state object; the page wires it back
// into messages and the persistent session at the end of finishTurn.

import { renderAnswer } from "./markdown.js";
import { schedulePersist } from "./history.js";

export function appendUserNode(cThread, scrollDown, text) {
  const msg = document.createElement("div");
  msg.className = "c-msg user";
  const role = document.createElement("div");
  role.className = "c-role";
  role.textContent = "YOU";
  const bubble = document.createElement("div");
  bubble.className = "u-bubble";
  bubble.textContent = text;
  msg.append(role, bubble);
  cThread.appendChild(msg);
  scrollDown(true);
}

export function appendAssistantNode(cThread, scrollDown, withThinking) {
  const msg = document.createElement("div");
  msg.className = "c-msg bot";
  msg.innerHTML = `
    <div class="c-role">BONSAI</div>
    ${
    withThinking
      ? `
    <div class="t-block live open">
      <button class="t-head" type="button">
        <span class="t-chev">&#9654;</span>
        <span class="t-label t-shimmer">THINKING</span>
      </button>
      <div class="t-body"></div>
    </div>`
      : ""
  }
    <div class="a-body"></div>`;
  const tBlock = msg.querySelector(".t-block");
  tBlock?.querySelector(".t-head").addEventListener("click", () => {
    if (tBlock.classList.contains("live")) return;
    const open = tBlock.classList.toggle("open");
    if (open) tBlock.querySelector(".t-body").scrollTop = 0;
  });
  cThread.appendChild(msg);
  scrollDown(true);
  return msg;
}

export function createTurnState({ cThread, scrollDown, thinkTurn }) {
  const msg = appendAssistantNode(cThread, scrollDown, thinkTurn);
  return {
    msg,
    tBlock: msg.querySelector(".t-block"),
    tBody: msg.querySelector(".t-body"),
    tLabel: msg.querySelector(".t-label"),
    aBody: msg.querySelector(".a-body"),
    phase: thinkTurn ? "think" : "answer",
    thinking: "",
    answer: "",
    toolStatuses: [],
    closed: false,
    startedAt: performance.now(),
    firstTokenAt: 0,
    thinkEndedAt: 0,
    tokens: 0,
  };
}

export function finishThinking(turn, setStatus) {
  turn.closed = true;
  turn.thinkEndedAt = performance.now();
  turn.tBlock.classList.remove("live", "open");
  const seconds = (
    (turn.thinkEndedAt - (turn.firstTokenAt || turn.startedAt)) / 1e3
  ).toFixed(1);
  turn.tLabel.classList.remove("t-shimmer");
  turn.tLabel.textContent = `THOUGHT FOR ${seconds}S`;
  if (!turn.thinking.trim()) turn.tBlock.remove();
  setStatus("busy", "WRITING …");
}

export function consumeTurnEvent(event, turn, env) {
  if (event.type === "tool_call") {
    env.appendToolCallCard(turn, event.call);
    return;
  }
  if (event.type === "complete") {
    turn.tokens = event.result.tokens.length;
    return;
  }
  if (!turn.firstTokenAt) turn.firstTokenAt = performance.now();
  turn.tokens++;
  if (event.type === "thinking") {
    turn.thinking += event.delta;
    env.scheduleStreamPaint(() => {
      turn.tBody.textContent = turn.thinking;
      turn.tBody.scrollTop = turn.tBody.scrollHeight;
    });
  } else if (event.type === "text") {
    if (turn.phase === "think") {
      turn.phase = "answer";
      finishThinking(turn, env.setStatus);
    }
    turn.answer += turn.answer === "" ? event.delta.replace(/^\s+/, "") : event.delta;
    env.scheduleStreamPaint(() => renderAnswer(turn.aBody, turn.answer, true));
  }
  env.updateLiveStat({
    liveEl: env.cLive,
    startedAt: turn.startedAt,
    firstTokenAt: turn.firstTokenAt,
    now: performance.now(),
    tokens: turn.tokens,
  });
}

export function handleGenerationError(error, turn, setStatus) {
  console.error(error);
  if (!turn.answer) {
    turn.aBody.innerHTML = "";
    const err = document.createElement("div");
    err.className = "a-error";
    err.textContent = `Generation stopped: ${String(error?.message ?? error)}`;
    turn.aBody.appendChild(err);
  }
  setStatus("error", "ERROR · SEE CONSOLE");
}

export function lockContextFull(turn, env) {
  env.contextExhausted = true;
  const note = document.createElement("div");
  note.className = "a-ctxfull";
  note.textContent = `CONTEXT WINDOW FULL · ${env.chat.contextLength} TOKENS — PRESS CLEAR TO START FRESH`;
  turn.msg.appendChild(note);
  env.cInput.disabled = true;
  env.cInput.placeholder = "Context window full — press CLEAR to start fresh";
  env.refreshSend();
  env.setStatus("error", "CONTEXT FULL");
  env.scrollDown();
}

// Drop the heavy accumulator fields from a finished turn so the
// `turn` object becomes eligible for collection once the chat moves
// on. The painted text is already in the DOM (turn.tBody for
// thinking, turn.aBody for the answer); keeping the source strings
// around serves no display purpose and prevents V8 from reclaiming
// a multi-KB string per turn in a long session.
//
// `turn.msg`, `turn.tBlock`, `turn.tLabel`, `turn.tBody`,
// `turn.aBody` stay attached — they are needed by future renders
// (history scroll-back, re-render on visibility change) and the
// meta line. Their element refs are cheap.
function releaseTurnBuffers(turn) {
  turn.phase = null;
  turn.thinking = "";
  turn.answer = "";
  turn.toolStatuses = null;
  turn.closed = true;
}

export function finishTurn(turn, env) {
  if (turn.phase === "think" && !turn.closed) {
    turn.tBlock.classList.remove("live");
    turn.tLabel.classList.remove("t-shimmer");
    turn.tLabel.textContent = "THINKING (INTERRUPTED)";
  }
  env.cancelStreamPaint();
  if (turn.tBody?.isConnected) {
    turn.tBody.textContent = turn.thinking;
    turn.tBody.scrollTop = turn.tBody.scrollHeight;
  }
  if (turn.answer || !turn.aBody.firstChild) {
    renderAnswer(turn.aBody, turn.answer, false);
  }
  env.appendTurnMeta(turn.msg, {
    startedAt: turn.startedAt,
    firstTokenAt: turn.firstTokenAt,
    thinkEndedAt: turn.thinkEndedAt,
    endedAt: performance.now(),
    tokens: turn.tokens,
  });
  env.scrollDown();
  const content = env.chat.lastAssistantContent;
  if (content !== null) env.messages.push({ role: "assistant", content });
  // Persist is debounced (history.js's schedulePersist coalesces
  // multiple finishTurn calls into a single write); a fresh page
  // (pagehide / visibilitychange→hidden) flushes it before unload so
  // a tab close doesn't lose the last turn. Pure localStorage write
  // runs at the trailing edge of the click that finished generation.
  env.schedulePersist({
    id: env.sessionId,
    title: env.sessionTitle,
    messages: env.messages,
  });
  // Now that the thinking/answer text is in the DOM, drop the
  // raw accumulator strings. This is the single biggest win for
  // long sessions — a 4 000-token reply was holding two ~12 KB
  // strings alive per turn for the rest of the session.
  releaseTurnBuffers(turn);
  env.setGenerating(false);
  env.cLive.textContent = "";
  env.abortController = null;
  if (env.chat.contextFull) lockContextFull(turn, env);
  else env.cInput.focus();
}
