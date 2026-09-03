import { Bonsai27B, DEFAULT_GGUF_FILE } from "../model/adapter.js";
import { WorkerBonsai27B } from "../model/bonsai-client.js";
import { setupModelAccess } from "../model/access.js";
import { renderAnswer } from "../chat/markdown.js";
import { renderHistoryPanel } from "../chat/history-panel.js";
import { updateLiveStat } from "../chat/live-stats.js";
import {
  scheduleStreamPaint,
  cancelStreamPaint,
  appendTurnMeta,
} from "../chat/turn-meta.js";
import {
  appendHistoricalAssistant as appendHistoricalAssistantModule,
  appendHistoricalTool as appendHistoricalToolModule,
} from "../chat/historical.js";
import {
  appendUserNode,
  createTurnState as createTurnStateModule,
  consumeTurnEvent,
  handleGenerationError,
  finishTurn,
} from "../chat/turn.js";
import {
  runToolRound as runToolRoundModule,
  streamAssistantRound as streamAssistantRoundModule,
  appendToolCallCard,
  buildStreamTools,
} from "../chat/tool-runner.js";
import { setupKernelInspector } from "../model/kernel/inspector.js";
import {
  makeSessionId,
  persistSession,
  loadSession,
  readSessionIndex,
  removeSession,
} from "../chat/history.js";

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
let sessionTitle = "";
let sessionId = null;
let lastAssistantContent = null;
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
  const index = readSessionIndex();
  if (index.length > 0) {
    const last = index[0];
    const data = loadSession(last.id);
    if (data) {
      sessionId = data.id;
      sessionTitle = data.title;
      messages = data.messages ?? [];
      for (const m of messages) {
        if (m.role === "user") appendUser(m.content ?? "");
        else if (m.role === "assistant" && m.content) appendHistoricalAssistant(m.content);
        else if (m.role === "tool") appendHistoricalTool(m);
      }
      if (messages.length > 0) removeWelcome();
    }
  }
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
$("newSessionBtn")?.addEventListener("click", newSession);
$("historyBtn")?.addEventListener("click", toggleHistoryPanel);
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
  persistSession({ id: sessionId, title: sessionTitle, messages });
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

function newSession() {
  if (isGenerating) return;
  persistSession({
    id: sessionId,
    title: sessionTitle,
    messages,
  });
  messages = [];
  sessionId = makeSessionId();
  sessionTitle = "New chat";
  chat?.reset();
  contextExhausted = false;
  cInput.disabled = false;
  cInput.placeholder = "Ask anything…";
  setStatus("", "READY");
  cThread.replaceChildren(welcomeTemplate.cloneNode(true));
  renderSeeds();
  cInput.focus();
  removeSession(sessionId);
  refreshHistoryPanel();
}

let historyPanelOpen = false;
function toggleHistoryPanel() {
  historyPanelOpen = !historyPanelOpen;
  refreshHistoryPanel();
}

function refreshHistoryPanel() {
  const panel = $("historyPanel");
  if (!panel) return;
  if (!historyPanelOpen) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  renderHistoryPanel({
    panel,
    sessionId,
    index: readSessionIndex(),
    onOpen: (id) => openSession(id),
    onDelete: (id) => {
      if (id === sessionId) newSession();
      else removeSession(id);
      refreshHistoryPanel();
    },
  });
}

function openSession(id) {
  if (isGenerating) return;
  const data = loadSession(id);
  if (!data) return;
  persistSession();
  messages = data.messages ?? [];
  sessionId = data.id ?? id;
  sessionTitle = data.title ?? "Restored chat";
  chat?.reset();
  contextExhausted = false;
  cThread.replaceChildren(welcomeTemplate.cloneNode(true));
  for (const m of messages) {
    if (m.role === "user") appendUser(m.content ?? "");
    else if (m.role === "assistant" && m.content) appendHistoricalAssistant(m.content);
    else if (m.role === "tool") appendHistoricalTool(m);
  }
  if (messages.length === 0) {
    cThread.replaceChildren(welcomeTemplate.cloneNode(true));
    renderSeeds();
  }
  removeWelcome();
  cInput.disabled = false;
  cInput.focus();
  refreshHistoryPanel();
}

function appendHistoricalAssistant(text) {
  appendHistoricalAssistantModule(cThread, text);
}

function appendHistoricalTool(record) {
  appendHistoricalToolModule(cThread, record);
}

function appendUser(text) {
  appendUserNode(cThread, scrollDown, text);
}

function createTurnState(thinkTurn) {
  return createTurnStateModule({ cThread, scrollDown, thinkTurn });
}

function turnEnv() {
  return {
    chat,
    cThread,
    cInput,
    cLive,
    messages,
    sessionId,
    sessionTitle,
    abortController,
    contextExhausted,
    persistSession,
    setStatus,
    setGenerating,
    scrollDown,
    refreshSend,
    scheduleStreamPaint,
    cancelStreamPaint,
    appendTurnMeta,
    appendToolCallCard,
    updateLiveStat,
  };
}

async function runToolRound(turn, calls) {
  return runToolRoundModule(turn, calls);
}

async function streamAssistantRound(turn, options) {
  return streamAssistantRoundModule(chat, messages, turn, options);
}

async function send() {
  const text = cInput.value.trim();
  if (!text || !chat || isGenerating || contextExhausted) return;
  removeWelcome();
  cInput.value = "";
  autoGrow();
  appendUser(text);
  messages.push({ role: "user", content: text });
  if (!sessionId) sessionId = makeSessionId();
  if (!sessionTitle || sessionTitle === "New chat" || sessionTitle === "Untitled chat") {
    sessionTitle = text.length > 60 ? text.slice(0, 57) + "…" : text;
  }
  persistSession({ id: sessionId, title: sessionTitle, messages });
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
        tools: buildStreamTools(),
        toolChoice: "auto",
      });
      if (toolCalls.length > 0) {
        messages.push({ role: "assistant", content: chat.lastAssistantContent ?? "" });
        messages.push(...await runToolRound(turn, toolCalls));
      }
    } while (toolCalls.length > 0 && !abortController.signal.aborted);
  } catch (error) {
    handleGenerationError(error, turn, setStatus);
  } finally {
    finishTurn(turn, turnEnv());
  }
}

setupKernelInspector({ getChat: () => chat, byId: $ });
