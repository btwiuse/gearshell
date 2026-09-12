const $ = (id) => document.getElementById(id);
const ui = {
  messages: $("messages"), model: $("model"), load: $("loadModel"),
  modelStatus: $("modelStatus"), system: $("systemPrompt"), read: $("readTool"),
  grep: $("grepTool"), prompt: $("prompt"), composer: $("composer"),
  send: $("send"), stop: $("stop"), status: $("status"), newChat: $("newChat"), think: $("think"),
  sessionList: $("sessionList"), sessionCount: $("sessionCount"),
};
const TOOL_PROTOCOL = `When a workspace tool is needed, respond only with this XML:\n<tool_call>\n<function=read>\n<parameter=path>PATH</parameter>\n</tool_call>\nor\n<tool_call>\n<function=grep>\n<parameter=pattern>TEXT</parameter>\n<parameter=path>OPTIONAL_PATH</parameter>\n</tool_call>\nDo not invent tool results.`;
let session = null;
let modelId = null;
let history = [];
let sessions = [];
let activeSessionId = null;
let ready = false;
let sending = false;
let thinkEnabled = false;

function status(text, state = "idle") {
  ui.status.textContent = text;
  ui.status.dataset.state = state;
}

function setSending(next) {
  sending = next;
  ui.send.disabled = next || !ready;
  ui.prompt.disabled = next || !ready;
  ui.stop.disabled = !next;
}

function addMessage(kind, text = "") {
  const node = document.createElement("article");
  node.className = `message ${kind}`;
  node.textContent = text;
  ui.messages.querySelector(".empty")?.remove();
  ui.messages.append(node);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  return node;
}

function restoreMessages() {
  ui.messages.replaceChildren();
  for (const message of history) addMessage(message.role, message.content);
  if (!history.length) {
    ui.messages.innerHTML = "<div class=\"empty\"><h3>New GearLLM chat</h3><p>The model remains shared and resident in GearShell.</p></div>";
  }
}

function persistSessions() {
  try { localStorage.setItem("gearllm:sessions", JSON.stringify(sessions)); } catch {}
}

function renderSessions() {
  ui.sessionCount.textContent = String(sessions.length);
  ui.sessionList.replaceChildren(...sessions.map((item) => {
    const button = document.createElement("button");
    button.className = `session-item${item.id === activeSessionId ? " active" : ""}`;
    button.textContent = item.title;
    button.type = "button";
    button.addEventListener("click", () => selectSession(item.id));
    return button;
  }));
}

function saveActiveSession() {
  const item = sessions.find((entry) => entry.id === activeSessionId);
  if (!item) return;
  item.messages = history;
  item.updatedAt = Date.now();
  item.title = history.find((entry) => entry.role === "user")?.content.slice(0, 48) || "New chat";
  sessions.sort((left, right) => right.updatedAt - left.updatedAt);
  persistSessions();
  renderSessions();
}

function selectSession(id) {
  const item = sessions.find((entry) => entry.id === id);
  if (!item || sending) return;
  activeSessionId = id;
  history = item.messages || [];
  restoreMessages();
  renderSessions();
}

function createSessionHistory() {
  activeSessionId = `chat-${Date.now().toString(36)}`;
  history = [];
  sessions.unshift({ id: activeSessionId, title: "New chat", messages: history, updatedAt: Date.now() });
  saveActiveSession();
}

function append(node, text) {
  node.textContent += text;
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

function splitThinking(text) {
  const start = text.indexOf("<think>");
  const end = text.indexOf("</think>");
  if (start !== -1 && end >= start) {
    return {
      thinking: text.slice(start + 7, end).trim(),
      answer: `${text.slice(0, start)}${text.slice(end + 8)}`.trim(),
    };
  }
  const answerStart = text.lastIndexOf("\n\n");
  if (answerStart === -1 || !/^here'?s a thinking process:/i.test(text.trim())) {
    return { thinking: "", answer: text };
  }
  return {
    thinking: text.slice(0, answerStart).trim(),
    answer: text.slice(answerStart + 2).trim(),
  };
}

function renderReply(node, reasoning, raw) {
  const split = splitThinking(raw);
  node.textContent = split.answer || raw;
  if (split.thinking && thinkEnabled) {
    reasoning.querySelector("pre").textContent = split.thinking;
  } else {
    reasoning.remove();
  }
}

function activeTools() {
  const tools = [];
  if (ui.read.checked) tools.push("read");
  if (ui.grep.checked) tools.push("grep");
  return tools;
}

function promptMessages() {
  const tools = activeTools();
  const system = [ui.system.value.trim(), tools.length ? TOOL_PROTOCOL : ""]
    .filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, ...history];
}

function extractToolCall(text) {
  const match = text.match(/<tool_call>[\s\S]*?<function=(read|grep)>[\s\S]*?<\/tool_call>/i);
  if (!match || !activeTools().includes(match[1])) return null;
  const args = {};
  for (const entry of match[0].matchAll(/<parameter=(\w+)>([\s\S]*?)<\/parameter>/gi)) {
    args[entry[1]] = entry[2].trim();
  }
  return { name: match[1], args };
}

function joinPath(parent, name) {
  return parent === "." ? name : `${parent.replace(/\/$/, "")}/${name}`;
}

async function listWorkspace(path = ".", depth = 0, out = []) {
  if (depth > 3 || out.length >= 100) return out;
  const entries = await GearShell.fs.readDir(path);
  for (const entry of entries) {
    const next = joinPath(path, entry.name);
    if (entry.isDirectory) await listWorkspace(next, depth + 1, out);
    else out.push(next);
    if (out.length >= 100) break;
  }
  return out;
}

async function runTool(call) {
  if (call.name === "read") {
    const path = call.args.path;
    if (!path) throw new Error("read requires path");
    const text = await GearShell.fs.readFileText(path);
    return `${path}:\n${text.slice(0, 12000)}`;
  }
  const pattern = call.args.pattern;
  if (!pattern) throw new Error("grep requires pattern");
  const paths = call.args.path ? [call.args.path] : await listWorkspace();
  const regex = new RegExp(pattern, "i");
  const hits = [];
  for (const path of paths) {
    if (hits.length >= 50) break;
    try {
      const lines = (await GearShell.fs.readFileText(path)).split("\n");
      lines.forEach((line, index) => {
        if (hits.length < 50 && regex.test(line)) hits.push(`${path}:${index + 1}: ${line}`);
      });
    } catch {}
  }
  return hits.length ? hits.join("\n") : "No matches.";
}

function waitForStream(sessionId, target, reasoning) {
  let finish;
  let raw = "";
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Inference stream timed out.")), 120000);
    const listener = (payload) => {
      if (payload?.sessionId !== sessionId) return;
      const event = payload.event;
      if (event?.type === "queued") status("Waiting for the shared inference host…", "loading");
      if (event?.type === "text" || event?.type === "thinking") {
        raw += event.delta;
        append(thinkEnabled ? reasoning.querySelector("pre") : target, event.delta);
      }
      if (event?.type === "_error") finish(new Error(event.error));
      if (event?.type === "_end") finish();
    };
    finish = (error) => {
      clearTimeout(timer);
      GearShell.off("inference.event", listener);
      error ? reject(error) : resolve(raw);
    };
    GearShell.on("inference.event", listener);
  });
  return promise;
}

async function generate(messages) {
  const reasoning = document.createElement("details");
  reasoning.className = "message reasoning";
  reasoning.open = true;
  reasoning.innerHTML = "<summary>Reasoning</summary><pre></pre>";
  const answer = addMessage("assistant");
  if (thinkEnabled) answer.before(reasoning);
  const stream = waitForStream(session.id, answer, reasoning);
  await GearShell.inference.send(session.id, messages, { think: thinkEnabled });
  return { answer, reasoning, text: await stream };
}

async function sendTurn(text) {
  const user = { role: "user", content: text };
  history.push(user);
  addMessage("user", text);
  setSending(true);
  status("Generating…", "loading");
  try {
    let generated = await generate(promptMessages());
    let reply = generated.text;
    renderReply(generated.answer, generated.reasoning, reply);
    const call = extractToolCall(reply);
    if (call) {
      const toolCard = addMessage("tool", `Using ${call.name}…`);
      const result = await runTool(call);
      toolCard.textContent = `${call.name} result\n${result.slice(0, 12000)}`;
      history.push({ role: "assistant", content: reply });
      history.push({ role: "user", content: `Tool result for ${call.name}:\n${result}\n\nNow answer the user's request using this result. Do not call another tool.` });
      generated = await generate(promptMessages());
      reply = generated.text;
      renderReply(generated.answer, generated.reasoning, reply);
    }
    history.push({ role: "assistant", content: reply });
    saveActiveSession();
    status("Ready", "ready");
  } catch (error) {
    addMessage("error", error?.message || String(error));
    status("Generation failed", "error");
  } finally {
    setSending(false);
    ui.prompt.focus();
  }
}

async function ensureSession() {
  if (session) return session;
  session = await GearShell.inference.createSessionInfo({ model: modelId });
  return session;
}

function applyHostStatus(host) {
  ready = host.state === "ready";
  ui.modelStatus.textContent = host.model?.id ? `Resident: ${host.model.id}` : `Host: ${host.state}`;
  if (!sending) status(ready ? "Ready" : host.state, host.state);
  setSending(sending);
}

async function refreshHost() {
  applyHostStatus(await GearShell.inference.status());
}

async function loadModel() {
  status("Loading model…", "loading");
  ui.load.disabled = true;
  await GearShell.inference.load(modelId, {});
  await resetChat();
  await refreshHost();
  ui.load.disabled = false;
}

async function resetChat() {
  if (session) await GearShell.inference.closeSession(session.id);
  session = null;
  createSessionHistory();
  restoreMessages();
}

async function boot() {
  await GearShell.subscribe("inference.event");
  await GearShell.subscribe("inference.status");
  GearShell.on("inference.status", applyHostStatus);
  const models = await GearShell.inference.list();
  ui.model.replaceChildren(...models.map((model) => new Option(model.label, model.id)));
  modelId = ui.model.value;
  try { sessions = JSON.parse(localStorage.getItem("gearllm:sessions") || "[]"); } catch {}
  if (sessions.length) selectSession(sessions[0].id);
  else createSessionHistory();
  await refreshHost();
  setInterval(() => refreshHost().catch(() => {}), 1000);
}

ui.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = ui.prompt.value.trim();
  if (!text || sending) return;
  ui.prompt.value = "";
  ensureSession().then(() => sendTurn(text));
});
ui.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ui.composer.requestSubmit(); }
});
ui.model.addEventListener("change", () => { modelId = ui.model.value; });
ui.think.addEventListener("click", () => {
  thinkEnabled = !thinkEnabled;
  ui.think.setAttribute("aria-pressed", String(thinkEnabled));
});
ui.load.addEventListener("click", () => loadModel().catch((error) => { ui.load.disabled = false; status(error.message, "error"); }));
ui.newChat.addEventListener("click", () => resetChat().catch((error) => status(error.message, "error")));
ui.stop.addEventListener("click", () => session && GearShell.inference.abort(session.id));
window.addEventListener("pagehide", () => session && GearShell.inference.closeSession(session.id).catch(() => {}));
boot().catch((error) => status(error.message, "error"));
