import { Bonsai27B, DEFAULT_GGUF_FILE } from "../model/adapter.js";
import { WorkerBonsai27B } from "../model/bonsai-client.js";
import { setupModelAccess } from "../model/access.js";
import { renderAnswer } from "../chat/markdown.js";
import { executeToolCall, getGearShellTools } from "../chat/tools.js";
import { setupKernelInspector } from "../model/kernel/inspector.js";

const $ = (id) => document.getElementById(id);
const queryParams = new URLSearchParams(location.search);
const useWorkerRuntime = queryParams.get("runtime") === "worker";
const modelRuntime = useWorkerRuntime ? WorkerBonsai27B : Bonsai27B;
// Opt-in reasoning controls for bitgpu's think mode. Defaults stay untouched,
// so the page behaves identically without these query parameters.
const thinkBudgetRaw = queryParams.get("thinkBudget");
const parsedThinkBudget = Number.parseInt(thinkBudgetRaw ?? "", 10);
const thinkBudget = thinkBudgetRaw !== null &&
    thinkBudgetRaw.trim() !== "" &&
    Number.isFinite(parsedThinkBudget) &&
    parsedThinkBudget >= 0
  ? parsedThinkBudget
  : undefined;
const thinkEarlyStop = queryParams.has("thinkEarlyStop")
  ? queryParams.get("thinkEarlyStop") !== "off"
  : undefined;
let chat = null;
let messages = [];
let isGenerating = false;
let contextExhausted = false;
let abortController = null;
const SEED_EXAMPLES = [
  {
    label: "LOGIC PUZZLE",
    prompt:
      "You have three boxes labeled Apples, Oranges, and Mixed. Every label is wrong.\n\nYou may take one fruit from one box without looking inside. How can you correctly relabel all three boxes?",
  },
  {
    label: "GENERATE CODE",
    prompt:
      "Write a python function that takes a list of numbers and returns the sum of the even numbers.",
  },
  { label: "WRITE A HAIKU", prompt: "Write a haiku about a bonsai tree." },
];
const chatx = $("chatx"),
  cScroll = $("cScroll"),
  cThread = $("cThread");
const cInput = $("cInput"),
  cSend = $("cSend"),
  cStop = $("cStop");
const cStatus = $("cStatus"),
  cStatusText = $("cStatusText"),
  cLive = $("cLive");
const modelAccess = setupModelAccess({
  Bonsai27B: modelRuntime,
  defaultGgufFile: DEFAULT_GGUF_FILE,
  byId: $,
  getChat: () => chat,
  setChat: (nextChat) => {
    chat = nextChat;
  },
  onChatReady: prepChatUi,
});
BonsaiLoader.onReady(() => setTimeout(enterChat, 1800));
function enterChat() {
  if (
    !modelAccess.isReady() || document.body.classList.contains("stage-chat")
  ) {
    return;
  }
  document.body.classList.add("stage-chat");
  chatx.classList.add("show");
  setStatus("", "READY");
  setTimeout(() => cInput.focus(), 450);
}
function prepChatUi() {
  cInput.disabled = false;
  $("clearBtn").disabled = false;
  $("thinkToggle").disabled = false;
  renderSeeds();
  refreshSend();
}
function setStatus(mode, text) {
  cStatus.className = "c-status" + (mode ? " " + mode : "");
  if (text !== void 0) cStatusText.textContent = text;
}
function renderSeeds() {
  const wrap = $("cSeeds");
  if (!wrap) return;
  wrap.replaceChildren(
    ...SEED_EXAMPLES.map((seed) => {
      const b = document.createElement("button");
      b.className = "c-seed";
      b.type = "button";
      b.dataset.prompt = seed.prompt;
      b.textContent = seed.label;
      return b;
    }),
  );
}
document.addEventListener("click", (e) => {
  const seed = e.target.closest(".c-seed");
  if (!seed || seed.disabled || !chat || isGenerating) return;
  cInput.value = seed.dataset.prompt || "";
  send();
});
cSend.addEventListener("click", send);
cStop.addEventListener("click", () => abortController?.abort());
$("clearBtn").addEventListener("click", clearChat);
cInput.addEventListener("input", () => {
  autoGrow();
  refreshSend();
});
cInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!cSend.disabled) send();
  }
});
function refreshSend() {
  cSend.disabled = isGenerating || contextExhausted || !chat ||
    cInput.value.trim() === "";
}
function autoGrow() {
  cInput.style.height = "auto";
  cInput.style.height = `${Math.min(cInput.scrollHeight, 180)}px`;
}
function scrollDown(force = false) {
  const nearBottom = cScroll.scrollHeight - cScroll.scrollTop - cScroll.clientHeight < 90;
  if (force || nearBottom) cScroll.scrollTop = cScroll.scrollHeight;
}
function setGenerating(on) {
  isGenerating = on;
  cInput.disabled = on;
  $("clearBtn").disabled = on;
  $("thinkToggle").disabled = on;
  cSend.style.display = on ? "none" : "";
  cStop.style.display = on ? "grid" : "none";
  document.querySelectorAll(".c-seed").forEach((s) => {
    s.disabled = on;
  });
  setStatus(
    on ? "busy" : "",
    on ? (thinkingEnabled ? "REASONING …" : "WRITING …") : "READY",
  );
  refreshSend();
}
let thinkingEnabled = false;
const thinkToggle = $("thinkToggle");
thinkToggle.addEventListener("click", () => {
  thinkingEnabled = !thinkingEnabled;
  thinkToggle.classList.toggle("on", thinkingEnabled);
  thinkToggle.setAttribute("aria-pressed", String(thinkingEnabled));
  $("thinkTip").textContent = `THINKING ${thinkingEnabled ? "ON" : "OFF"}`;
});
const welcomeTemplate = $("cWelcome").cloneNode(true);
function removeWelcome() {
  $("cWelcome")?.remove();
}
function clearChat() {
  if (isGenerating) return;
  messages = [];
  chat?.reset();
  contextExhausted = false;
  cInput.disabled = false;
  cInput.placeholder = "Ask anything…";
  setStatus("", "READY");
  cThread.replaceChildren(welcomeTemplate.cloneNode(true));
  renderSeeds();
  cInput.focus();
}
function appendUser(text) {
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
function appendAssistant(withThinking) {
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
function createTurnState(thinkTurn) {
  const msg = appendAssistant(thinkTurn);
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

function finishThinking(turn) {
  turn.closed = true;
  turn.thinkEndedAt = performance.now();
  turn.tBlock.classList.remove("live", "open");
  const seconds = (
    (turn.thinkEndedAt - (turn.firstTokenAt || turn.startedAt)) /
    1e3
  ).toFixed(1);
  turn.tLabel.classList.remove("t-shimmer");
  turn.tLabel.textContent = `THOUGHT FOR ${seconds}S`;
  if (!turn.thinking.trim()) turn.tBlock.remove();
  setStatus("busy", "WRITING …");
}

function appendToolCall(turn, call) {
  const card = document.createElement("div");
  card.className = "c-tool-call";
  const name = document.createElement("div");
  name.className = "c-tool-name";
  name.textContent = `CALLING ${call.name}`;
  const detail = document.createElement("pre");
  detail.className = "c-tool-detail";
  detail.textContent = JSON.stringify(call.arguments ?? {}, null, 2);
  const status = document.createElement("div");
  status.className = "c-tool-status";
  status.textContent = "RUNNING";
  card.append(name, detail, status);
  turn.aBody.appendChild(card);
  scrollDown();
  return status;
}

function consumeTurnEvent(event, turn) {
  const now = performance.now();
  if (event.type === "tool_call") {
    event.statusElement = appendToolCall(turn, event.call);
    return;
  }
  if (event.type === "complete") {
    turn.tokens = event.result.tokens.length;
    return;
  }
  if (!turn.firstTokenAt) turn.firstTokenAt = now;
  turn.tokens++;
  if (event.type === "thinking") {
    turn.thinking += event.delta;
    scheduleStream(() => {
      turn.tBody.textContent = turn.thinking;
      turn.tBody.scrollTop = turn.tBody.scrollHeight;
    });
  } else if (event.type === "text") {
    if (turn.phase === "think") {
      turn.phase = "answer";
      finishThinking(turn);
    }
    turn.answer += turn.answer === "" ? event.delta.replace(/^\s+/, "") : event.delta;
    scheduleStream(() => renderAnswer(turn.aBody, turn.answer, true));
  }
  updateLiveStat({
    startedAt: turn.startedAt,
    firstTokenAt: turn.firstTokenAt,
    now,
    tokens: turn.tokens,
  });
}

function handleGenerationError(error, turn) {
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

function finishTurn(turn) {
  if (turn.phase === "think" && !turn.closed) {
    turn.tBlock.classList.remove("live");
    turn.tLabel.classList.remove("t-shimmer");
    turn.tLabel.textContent = "THINKING (INTERRUPTED)";
  }
  cancelStream();
  if (turn.tBody?.isConnected) {
    turn.tBody.textContent = turn.thinking;
    turn.tBody.scrollTop = turn.tBody.scrollHeight;
  }
  if (turn.answer || !turn.aBody.firstChild) {
    renderAnswer(turn.aBody, turn.answer, false);
  }
  appendMeta(turn.msg, {
    startedAt: turn.startedAt,
    firstTokenAt: turn.firstTokenAt,
    thinkEndedAt: turn.thinkEndedAt,
    endedAt: performance.now(),
    tokens: turn.tokens,
  });
  scrollDown();
  const content = chat.lastAssistantContent;
  if (content !== null) messages.push({ role: "assistant", content });
  setGenerating(false);
  cLive.textContent = "";
  abortController = null;
  if (chat.contextFull) lockContextFull(turn.msg);
  else cInput.focus();
}

async function runToolRound(turn, calls) {
  const results = [];
  for (const call of calls) {
    const status = appendToolCall(turn, call);
    try {
      const content = await executeToolCall(call);
      status.textContent = "COMPLETE";
      results.push({ role: "tool", name: call.name, content });
    } catch (error) {
      const content = JSON.stringify({
        ok: false,
        error: String(error?.message ?? error),
      });
      status.textContent = "FAILED";
      results.push({ role: "tool", name: call.name, content });
    }
  }
  return results;
}

async function streamAssistantRound(turn, options) {
  const calls = [];
  for await (const event of chat.streamTurn(messages, options)) {
    if (event.type === "tool_call") calls.push(event.call);
    else consumeTurnEvent(event, turn);
  }
  return calls;
}

async function send() {
  const text = cInput.value.trim();
  if (!text || !chat || isGenerating || contextExhausted) return;
  removeWelcome();
  cInput.value = "";
  autoGrow();
  appendUser(text);
  messages.push({ role: "user", content: text });
  const thinkTurn = thinkingEnabled;
  const turn = createTurnState(thinkTurn);
  setGenerating(true);
  abortController = new AbortController();
  try {
    let toolCalls;
    do {
      toolCalls = await streamAssistantRound(turn, {
        signal: abortController.signal,
        think: thinkTurn,
        thinkBudget,
        thinkEarlyStop,
        tools: getGearShellTools(),
        toolChoice: "auto",
      });
      if (toolCalls.length > 0) {
        messages.push({ role: "assistant", content: chat.lastAssistantContent ?? "" });
        messages.push(...await runToolRound(turn, toolCalls));
      }
    } while (toolCalls.length > 0 && !abortController.signal.aborted);
  } catch (error) {
    handleGenerationError(error, turn);
  } finally {
    finishTurn(turn);
  }
}
function lockContextFull(msg) {
  contextExhausted = true;
  const note = document.createElement("div");
  note.className = "a-ctxfull";
  note.textContent =
    `CONTEXT WINDOW FULL · ${chat.contextLength} TOKENS — PRESS CLEAR TO START FRESH`;
  msg.appendChild(note);
  cInput.disabled = true;
  cInput.placeholder = "Context window full — press CLEAR to start fresh";
  refreshSend();
  setStatus("error", "CONTEXT FULL");
  scrollDown();
}
function appendMeta(
  msg,
  { startedAt, firstTokenAt, thinkEndedAt, endedAt, tokens },
) {
  if (tokens <= 0) return;
  const parts = [`${tokens} TOK`];
  if (thinkEndedAt) {
    parts.push(
      `THOUGHT ${((thinkEndedAt - (firstTokenAt || startedAt)) / 1e3).toFixed(1)}S`,
    );
  }
  if (firstTokenAt) {
    parts.push(`TTFT ${(firstTokenAt - startedAt).toFixed(0)} MS`);
  }
  if (tokens > 5 && firstTokenAt) {
    parts.push(
      `${
        ((tokens - 1) / Math.max((endedAt - firstTokenAt) / 1e3, 1e-9)).toFixed(
          1,
        )
      } TOK/S`,
    );
  }
  const meta = document.createElement("div");
  meta.className = "c-msg-meta";
  meta.textContent = parts.join("  ·  ");
  msg.appendChild(meta);
}
const LIVE_STAT_MS = 150;
let lastLiveStatAt = 0;
function updateLiveStat({ startedAt, firstTokenAt, now, tokens }) {
  if (tokens <= 1) {
    cLive.textContent = `TTFT ${(firstTokenAt - startedAt).toFixed(0)} MS`;
    lastLiveStatAt = now;
    return;
  }
  if (now - lastLiveStatAt < LIVE_STAT_MS) return;
  lastLiveStatAt = now;
  cLive.textContent = `${
    ((tokens - 1) / Math.max((now - firstTokenAt) / 1e3, 1e-9)).toFixed(0)
  } TOK/S`;
}
const STREAM_RENDER_MS = 33;
let streamPaint = null,
  renderQueued = false,
  lastRenderAt = 0;
function scheduleStream(paint) {
  streamPaint = paint;
  if (renderQueued) return;
  renderQueued = true;
  const tick = () => {
    if (!streamPaint) {
      renderQueued = false;
      return;
    }
    if (performance.now() - lastRenderAt < STREAM_RENDER_MS) {
      requestAnimationFrame(tick);
      return;
    }
    renderQueued = false;
    lastRenderAt = performance.now();
    const paintNow = streamPaint;
    streamPaint = null;
    paintNow();
    scrollDown();
  };
  requestAnimationFrame(tick);
}
function cancelStream() {
  streamPaint = null;
}

setupKernelInspector({ getChat: () => chat, byId: $ });
