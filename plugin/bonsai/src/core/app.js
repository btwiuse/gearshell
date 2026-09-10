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
import { setupModelCachePanel } from "../model/cache-panel.js";
import { setupToolsPanel } from "../chat/tools-panel.js";
import {
  buildConversation,
  buildGenerationOptions,
  loadChatSettings,
  loadRuntimeMode,
} from "../chat/settings.js";
import { setupSettingsPanel } from "../chat/settings-panel.js";
import {
  makeSessionId,
  persistSession,
  loadSession,
  readSessionIndex,
  removeSession,
  schedulePersist,
} from "../chat/history.js";

const $ = (id) => document.getElementById(id);
const queryParams = new URLSearchParams(location.search);
// Runtime selection. Priority:
//   1. ?runtime=worker / ?runtime=main  (one-off A/B test)
//   2. localStorage["bonsai_runtime_v1"] (user toggle in Settings)
//   3. default: "main"  (round 66: explicit user choice; round 65's
//      automatic default was reverted after observing it surprised
//      users who expected parity with the root bonsai/ page.)
const runtimeMode = loadRuntimeMode();
const useWorkerRuntime = runtimeMode === "worker";
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
let chatSettings = loadChatSettings();
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
// Pass both runtimes: network/URL loads use the worker host (off main
// thread, no per-token UI contention), local-file loads use the main
// thread (a Blob cannot cross postMessage to the worker). The chat
// path then runs at full worker speed once the model is resident.
const modelAccess = setupModelAccess({
  Bonsai27B: modelRuntime,
  FileBonsai27B: useWorkerRuntime ? Bonsai27B : modelRuntime,
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
  // Release the landing-page WebGL context so it stops holding GPU
  // resources while the model is streaming tokens. Without this, on
  // macOS the WebGL (Metal) context and bitgpu's WebGPU context share
  // the same Metal device and the idle background renderer drags the
  // token rate down. The prism and garden rAF loops already early-
  // exit when stage-chat is set, but the GL context itself stays
  // alive until dispose() — that's the leak this fixes.
  const bg = window.__bonsaiBackgroundScene;
  if (bg && bg.renderer) {
    try {
      bg.renderer.dispose();
      bg.renderer.forceContextLoss?.();
      window.__bonsaiBackgroundScene = null;
    } catch {}
  }
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
$("historyOverlay").addEventListener("click", (event) => {
  if (event.target.closest("[data-history-close]")) closeHistory();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("historyOverlay").hidden) closeHistory();
});
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
}

function closeHistory() {
  $("historyOverlay").hidden = true;
  $("historyBtn").setAttribute("aria-expanded", "false");
  document.body.classList.remove("kx-locked");
}

function toggleHistoryPanel() {
  const overlay = $("historyOverlay");
  if (!overlay.hidden) return closeHistory();
  refreshHistoryPanel();
  overlay.hidden = false;
  $("historyBtn").setAttribute("aria-expanded", "true");
  document.body.classList.add("kx-locked");
}

function refreshHistoryPanel() {
  renderHistoryPanel({
    panel: $("historyPanel"),
    sessionId,
    index: readSessionIndex(),
    onOpen: (id) => {
      openSession(id);
      closeHistory();
    },
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
  persistSession({ id: sessionId, title: sessionTitle, messages });
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
    schedulePersist,
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
  const conversation = buildConversation(messages, chatSettings.systemPrompt);
  return streamAssistantRoundModule(chat, conversation, turn, options);
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
  // Debounced: the actual localStorage write batches with the
  // finishTurn call below, so a single round trip writes once
  // with the final assistant content included.
  schedulePersist({
    id: sessionId,
    title: sessionTitle,
    messages,
  });
  const thinkTurn = thinkingEnabled;
  const turn = createTurnState(thinkTurn);
  setGenerating(true);
  abortController = new AbortController();
  // Build the turn env once for the whole generation. The original
  // bonsai/ root page kept its per-token hot path zero-allocation by
  // reading the same module-scoped vars directly; the plugin's
  // refactor wrapped every consumeTurnEvent in a closure that called
  // turnEnv() on each token, allocating an 18-key object per event.
  // At 20+ tok/s that GC pressure and extra indirection compounds
  // with the markdown reparse per paint and noticeably slows the
  // stream. Capture once, reuse for the whole send.
  const env = turnEnv();
  try {
    let toolCalls;
    do {
      toolCalls = await streamAssistantRound(turn, {
        ...buildGenerationOptions(chatSettings),
        signal: abortController.signal,
        think: thinkTurn,
        thinkBudget,
        thinkEarlyStop,
        ...buildStreamTools(),
        consumeTurnEvent: (event, activeTurn) =>
          consumeTurnEvent(event, activeTurn, env),
      });
      if (toolCalls.length > 0) {
        messages.push({ role: "assistant", content: chat.lastAssistantContent ?? "" });
        messages.push(...await runToolRound(turn, toolCalls));
      }
    } while (toolCalls.length > 0 && !abortController.signal.aborted);
  } catch (error) {
    if (!abortController?.signal.aborted) {
      handleGenerationError(error, turn, setStatus);
    }
  } finally {
    finishTurn(turn, env);
  }
}

setupKernelInspector({ getChat: () => chat, byId: $ });
setupModelCachePanel();
setupToolsPanel();
setupSettingsPanel((settings) => {
  chatSettings = settings;
});
