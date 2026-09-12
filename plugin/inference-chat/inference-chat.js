const elements = {
  messages: document.getElementById("messages"),
  modelLabel: document.getElementById("modelLabel"),
  status: document.getElementById("status"),
  composer: document.getElementById("composer"),
  prompt: document.getElementById("prompt"),
  send: document.getElementById("send"),
  stop: document.getElementById("stop"),
  newChat: document.getElementById("newChat"),
  model: document.getElementById("model"),
  loadModel: document.getElementById("loadModel"),
  think: document.getElementById("think"),
};

let session = null;
let history = [];
let sending = false;
let selectedModel = null;
let hostReady = false;
let thinkEnabled = false;

function setStatus(text, state = "idle") {
  elements.status.textContent = text;
  elements.status.dataset.state = state;
}

function setSending(next) {
  sending = next;
  elements.send.disabled = next || !hostReady;
  elements.stop.disabled = !next;
  elements.prompt.disabled = next || !hostReady;
}

function scrollMessages() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function addMessage(role, text = "") {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  message.textContent = text;
  elements.messages.querySelector(".empty-state")?.remove();
  elements.messages.append(message);
  scrollMessages();
  return message;
}

function resizeComposer() {
  elements.prompt.style.height = "auto";
  elements.prompt.style.height = `${Math.min(elements.prompt.scrollHeight, 160)}px`;
}

function modelLabel(status) {
  const model = status?.model?.id;
  if (model) return `Model: ${model}`;
  if (status?.state === "loading") return "Loading local model…";
  return "No model is resident";
}

async function refreshStatus() {
  const status = await GearShell.inference.status();
  hostReady = status.state === "ready";
  elements.modelLabel.textContent = modelLabel(status);
  setStatus(hostReady ? "Ready" : status.state, status.state);
  setSending(sending);
  return status;
}

async function populateModels() {
  const models = await GearShell.inference.list();
  elements.model.replaceChildren(...models.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  selectedModel = elements.model.value || null;
}

async function loadSelectedModel() {
  if (!selectedModel || sending) return;
  setStatus("Loading model…", "loading");
  elements.loadModel.disabled = true;
  await GearShell.inference.load(selectedModel, {});
  await startNewChat();
  await ensureSession();
  setStatus("Ready", "ready");
  elements.loadModel.disabled = false;
}

async function ensureSession() {
  if (session) return session;
  const status = await refreshStatus();
  if (status.state !== "ready") {
    setStatus("Loading model…", "loading");
  }
  session = await GearShell.inference.createSessionInfo({ model: selectedModel });
  elements.modelLabel.textContent = `Model: ${session.model}`;
  setSending(false);
  return session;
}

function appendDelta(target, delta) {
  target.textContent += delta;
  scrollMessages();
}

function splitThinking(text) {
  const start = text.indexOf("<think>");
  const end = text.indexOf("</think>");
  if (start === -1 || end < start) return { thinking: "", answer: text };
  return {
    thinking: text.slice(start + 7, end).trim(),
    answer: `${text.slice(0, start)}${text.slice(end + 8)}`.trim(),
  };
}

function renderAnswer(answer, thinking, raw) {
  const split = splitThinking(raw);
  answer.textContent = split.answer || raw;
  if (split.thinking) {
    thinking.textContent = split.thinking;
    thinking.hidden = !thinkEnabled;
  } else {
    thinking.remove();
  }
}

async function sendMessage(text) {
  const activeSession = await ensureSession();
  history.push({ role: "user", content: text });
  addMessage("user", text);
  const answer = addMessage("assistant");
  const thinking = addMessage("thinking");
  let answerText = "";
  let thinkingText = "";
  setSending(true);
  setStatus("Generating…", "loading");
  try {
    const stream = openStream(activeSession.id, answer, thinking, (event) => {
      if (event.type === "text") answerText += event.delta;
      if (event.type === "thinking") thinkingText += event.delta;
    });
    await GearShell.inference.send(activeSession.id, history, { think: thinkEnabled });
    await stream;
    renderAnswer(answer, thinking, `${thinkingText}${answerText}`);
    if (answerText) history.push({ role: "assistant", content: answerText });
    setStatus("Ready", "ready");
  } catch (error) {
    thinking.remove();
    answer.classList.add("error");
    answer.textContent = error?.message || String(error);
    setStatus("Generation failed", "error");
  } finally {
    setSending(false);
    elements.prompt.focus();
  }
}

function openStream(sessionId, answer, thinking, onEvent) {
  let finish;
  const stream = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Inference stream timed out.")), 120000);
    const handler = (payload) => {
      if (payload?.sessionId !== sessionId) return;
      const event = payload.event;
      if (event?.type === "queued") setStatus("Waiting for the shared inference host…", "loading");
      if (event?.type === "text") appendDelta(answer, event.delta);
      if (event?.type === "thinking") appendDelta(thinking, event.delta);
      if (event?.type === "_error") finish(new Error(event.error));
      if (event?.type === "_end") finish();
      if (event) onEvent(event);
    };
    finish = (error) => {
      window.clearTimeout(timeout);
      GearShell.off("inference.event", handler);
      if (error) reject(error);
      else resolve();
    };
    GearShell.on("inference.event", handler);
  });
  return stream;
}

async function stopGeneration() {
  if (!session || !sending) return;
  await GearShell.inference.abort(session.id);
  setStatus("Stopping…", "loading");
}

async function startNewChat() {
  if (sending) await stopGeneration();
  if (session) await GearShell.inference.closeSession(session.id);
  session = null;
  history = [];
  elements.messages.replaceChildren();
  elements.messages.innerHTML = "<div class=\"empty-state\"><h2>New chat</h2><p>Your previous session has been closed. The loaded model remains resident.</p></div>";
  await refreshStatus();
  elements.prompt.focus();
}

function applyHostStatus(nextStatus) {
  hostReady = nextStatus.state === "ready";
  elements.modelLabel.textContent = modelLabel(nextStatus);
  if (!sending) setStatus(hostReady ? "Ready" : nextStatus.state, nextStatus.state);
  setSending(sending);
}

function pollHostStatus() {
  refreshStatus().catch((error) => setStatus(error?.message || String(error), "error"));
}

async function boot() {
  try {
    await GearShell.subscribe("inference.event");
    await GearShell.subscribe("inference.status");
    GearShell.on("inference.status", applyHostStatus);
    await populateModels();
    const status = await refreshStatus();
    if (status.model?.id) {
      selectedModel = status.model.id;
      elements.model.value = selectedModel;
    }
    window.setInterval(pollHostStatus, 1000);
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.prompt.value.trim();
  if (!text || sending) return;
  elements.prompt.value = "";
  resizeComposer();
  sendMessage(text);
});
elements.prompt.addEventListener("input", resizeComposer);
elements.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});
elements.stop.addEventListener("click", () => stopGeneration().catch((error) => setStatus(error.message, "error")));
elements.newChat.addEventListener("click", () => startNewChat().catch((error) => setStatus(error.message, "error")));
elements.model.addEventListener("change", () => { selectedModel = elements.model.value; });
elements.think.addEventListener("click", () => {
  thinkEnabled = !thinkEnabled;
  elements.think.setAttribute("aria-pressed", String(thinkEnabled));
});
elements.loadModel.addEventListener("click", () => loadSelectedModel().catch((error) => {
  elements.loadModel.disabled = false;
  setStatus(error.message, "error");
}));
window.addEventListener("pagehide", () => {
  if (session) GearShell.inference.closeSession(session.id).catch(() => {});
});

boot();
