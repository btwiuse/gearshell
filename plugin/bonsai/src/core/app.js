import { Bonsai27B, DEFAULT_GGUF_FILE } from "../model/adapter.js";
import { WorkerBonsai27B } from "../model/bonsai-client.js";
import { RemoteBonsai27B, hostModeRequested } from "../model/remote-client.js";
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
import { hasActiveTools } from "../chat/tools.js";
import { setupKernelInspector } from "../model/kernel/inspector.js";
import { setupModelCachePanel } from "../model/cache-panel.js";
import { setupToolsPanel } from "../chat/tools-panel.js";
import {
  buildConversation,
  buildGenerationOptions,
  loadChatSettings,
  loadRuntimeMode,
  loadSystemPrompt,
  resolveSystemPrompt,
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
//   1. ?runtime=host / ?runtime=worker / ?runtime=main  (one-off A/B)
//   2. localStorage["bonsai_runtime_v1"]  (user toggle in Settings)
//   3. default: "main"  (round 66: explicit user choice; round 65's
//      automatic default was reverted after observing it surprised
//      users who expected parity with the root bonsai/ page.)
//
// "host" mode is the new RFC path: when the page is loaded inside a
// GearShell host iframe that exposes GearShell.inference.*, the plugin
// skips its own bitgpu engine and streams through the host's long-
// lived Worker. This is the per-tab GPU contention fix from RFC
// docs/rfc-inference-host.md. When ?runtime=host is requested but no
// host is available we silently fall back to "main".
const runtimeMode = loadRuntimeMode();
let modelRuntime;
if (runtimeMode === "host" && RemoteBonsai27B.isAvailable()) {
  modelRuntime = RemoteBonsai27B;
} else if (runtimeMode === "worker") {
  modelRuntime = WorkerBonsai27B;
} else {
  modelRuntime = Bonsai27B;
}
const useWorkerRuntime = modelRuntime === WorkerBonsai27B;
const useHostRuntime = modelRuntime === RemoteBonsai27B;
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
// Decide whether a GearShell host is wired at module init. Standalone
// (gear.sh/plugin/bonsai/buildless.html) and hosted (loaded inside the
// shell iframe) hit different paths: hosted has GearShell.bash.run and
// the tool loop is active; standalone falls through to the upstream
// bonsai/ code path with no tools, no system prompt, and the direct
// chat.streamTurn loop.
const hasGearShellHost =
  typeof window !== "undefined" &&
  typeof window.GearShell?.bash?.run === "function";
let chatSettings = loadChatSettings();
// System prompt is resolved separately from chat settings so the
// deployment-mode default (hosted vs standalone) takes effect even when
// the user has touched other settings. Persists via the dedicated
// bonsai_system_prompt_v1 key so we can tell "user explicitly set this"
// from "user never touched it".
chatSettings.systemPrompt = resolveSystemPrompt(hasGearShellHost);
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
// Pass the runtime that matches the user's choice. Worker host is the
// default for the network load (off main thread, no per-token UI
// contention); local-file loads use the main thread (a Blob cannot
// cross postMessage to the worker). The chat path runs at full worker
// speed once the model is resident. Shell-host mode skips local load
// entirely — the host's Worker is the engine.
const modelAccess = useHostRuntime
  ? null
  : setupModelAccess({
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
// Shell-host runtime: the host's Worker owns the model. Skip the
// local loader UI (gate + LOAD MODEL / LOAD FROM DISK buttons); the
// bootHostRuntime() call below triggers model creation through the
// host and reports status via inference events.
if (useHostRuntime) {
  for (const id of ["gateContinue", "loadFileCta"]) {
    const btn = byId(id);
    if (btn) btn.hidden = true;
  }
}
BonsaiLoader.onReady(() => {
  if (useHostRuntime) {
    setTimeout(bootHostRuntime, 1800);
  } else {
    setTimeout(enterChat, 1800);
  }
});
function enterChat() {
  // In host runtime mode, `modelAccess` is null — the host Worker
  // owns the model; we wait on the chat object directly instead.
  const ready = useHostRuntime ? !!chat : modelAccess.isReady();
  if (!ready || document.body.classList.contains("stage-chat")) {
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

// Host-runtime boot: create the chat through RemoteBonsai27B and run
// the same prepChatUi() the local load path triggers. Mirrors the
// ModelAccess.startLoad() flow but skips the loader UI (the host's
// progress stream lives in the shell's inference.status events).
async function bootHostRuntime() {
  try {
    const nextChat = await modelRuntime.load(DEFAULT_MODEL_ID, {});
    chat = nextChat;
    window.__bonsaiChat = nextChat;
    prepChatUi();
    BonsaiLoader.done();
  } catch (error) {
    console.error(error);
    BonsaiLoader.set(0, 1, {});
  }
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

// Upstream-style stream loop: no tool indirection, no closure capture,
// direct `for await` over chat.streamTurn. Matches bonsai/src/core/app.js
// exactly so the standalone build (gear.sh/plugin/bonsai/buildless.html,
// no GearShell host) gets the same per-token cost as the root page.
async function streamTurnDirect(turn, env) {
  const conversation = buildConversation(messages, chatSettings.systemPrompt);
  const streamOptions = {
    ...buildGenerationOptions(chatSettings),
    signal: abortController.signal,
    think: thinkingEnabled,
    thinkBudget,
    thinkEarlyStop,
  };
  for await (const event of chat.streamTurn(conversation, streamOptions)) {
    if (event.type === "tool_call") {
      // Tools were disabled mid-session (e.g. user toggled them off
      // while waiting for the model). Surface a card so the user
      // sees what happened instead of silently dropping the call.
      env.appendToolCallCard(turn, event.call);
      env.scheduleStreamPaint(() => {});
      continue;
    }
    consumeTurnEvent(event, turn, env);
  }
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
  // reading module-scoped vars directly; the plugin's refactor wrapped
  // every consumeTurnEvent in a closure that called turnEnv() on each
  // token, allocating an 18-key object per event. At 20+ tok/s that GC
  // pressure and extra indirection compounds with the markdown reparse
  // per paint and noticeably slows the stream. Capture once, reuse.
  const env = turnEnv();
  // Standalone deployment (https://gear.sh/plugin/bonsai/buildless.html,
  // no GearShell host) skips the tool-loop plumbing entirely. The model
  // isn't told any tools exist, every event goes straight to the chat
  // renderer, and we don't pay for streamAssistantRound's per-token
  // closure. Same code path the upstream bonsai/ root page uses.
  const toolsActive = hasActiveTools();
  try {
    if (toolsActive) {
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
    } else {
      await streamTurnDirect(turn, env);
    }
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
  // The settings form writes the prompt via saveSystemPrompt; mirror it
  // onto the in-memory chatSettings so the next send uses the user's
  // edit instead of the deployment-mode default.
  const userPrompt = loadSystemPrompt();
  if (userPrompt !== null) chatSettings.systemPrompt = userPrompt;
}, hasGearShellHost);
