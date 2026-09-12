const $ = (id) => document.getElementById(id);
const ui = {
  messages: $("messages"), model: $("model"), load: $("loadModel"),
  modelStatus: $("modelStatus"), system: $("systemPrompt"), read: $("readTool"),
  grep: $("grepTool"), panels: $("panelsTool"), bash: $("bashTool"), prompt: $("prompt"), composer: $("composer"),
  send: $("send"), stop: $("stop"), status: $("status"), newChat: $("newChat"), think: $("think"),
  sessionList: $("sessionList"), sessionCount: $("sessionCount"),
};
const TOOL_PROTOCOL = `The only callable function names are read, grep, panels, and bash. Shell commands such as ls, cat, pwd, whoami, or id are NOT functions: call bash with the command in its command parameter. Never emit <function=ls>, <function=cat>, or any other function name.\n\nWhen a workspace tool is needed, respond only with one of these XML forms:\n<function=read>\n<parameter=path>PATH</parameter>\n</function>\n<function=grep>\n<parameter=pattern>TEXT</parameter>\n<parameter=path>OPTIONAL_PATH</parameter>\n</function>\n<function=panels>\n<parameter=action>list|open|focus|close</parameter>\n<parameter=component>PANEL_COMPONENT_FOR_OPEN</parameter>\n<parameter=id>PANEL_ID_FOR_FOCUS_OR_CLOSE</parameter>\n<parameter=direction>OPTIONAL: left|right|above|below</parameter>\n</function>\n<function=bash>\n<parameter=command>COMMAND</parameter>\n<parameter=cwd>OPTIONAL_DIRECTORY</parameter>\n</function>\nFor panels: list returns open panes; open requires a component such as files, terminal, settings, browser, gearllm, or inference-chat; focus and close require an id returned by list. Do not add prose before or after a tool call. Do not invent tool results.`;
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
  ui.send.disabled = next;
  ui.prompt.disabled = next;
  ui.stop.disabled = !next;
}

function followsLatest() {
  const { scrollHeight, scrollTop, clientHeight } = ui.messages;
  return scrollHeight - scrollTop - clientHeight < 24;
}

function addMessage(kind, text = "") {
  const follow = followsLatest();
  const node = document.createElement("article");
  node.className = `message ${kind}`;
  node.textContent = text;
  ui.messages.querySelector(".empty")?.remove();
  ui.messages.append(node);
  if (follow) ui.messages.scrollTop = ui.messages.scrollHeight;
  return node;
}

function messageKind(message) {
  if (message.role === "assistant" && /<function=\w+>/i.test(message.content)) return "tool";
  if (message.role === "user" && message.content.startsWith("Tool result for ")) return "tool";
  return message.role;
}

function restoreMessages() {
  ui.messages.replaceChildren();
  for (const message of history) addMessage(messageKind(message), message.content);
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
    const remove = document.createElement("button");
    remove.className = "session-delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Delete conversation";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSession(item.id);
    });
    const row = document.createElement("div");
    row.className = "session-row";
    row.append(button, remove);
    return row;
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

function deleteSession(id) {
  if (sending) return;
  sessions = sessions.filter((item) => item.id !== id);
  if (id === activeSessionId) {
    if (sessions.length) selectSession(sessions[0].id);
    else createSessionHistory();
  } else {
    persistSessions();
    renderSessions();
  }
}

function createSessionHistory() {
  activeSessionId = `chat-${Date.now().toString(36)}`;
  history = [];
  sessions.unshift({ id: activeSessionId, title: "New chat", messages: history, updatedAt: Date.now() });
  saveActiveSession();
}

function append(node, text) {
  const follow = followsLatest();
  if (!node.isConnected) ui.messages.append(node);
  node.textContent += text;
  if (follow) ui.messages.scrollTop = ui.messages.scrollHeight;
}

function splitThinking(text) {
  const raw = String(text || "");
  const gemmaStart = raw.indexOf("<|channel>thought");
  const gemmaEnd = raw.indexOf("<channel|>", gemmaStart);
  if (gemmaStart !== -1) {
    const openEnd = gemmaStart + "<|channel>thought".length;
    return {
      thinking: raw.slice(openEnd, gemmaEnd === -1 ? undefined : gemmaEnd).trim(),
      answer: (gemmaEnd === -1 ? "" : raw.slice(gemmaEnd + 10)).trim(),
    };
  }
  const start = raw.indexOf("<think>");
  const end = raw.indexOf("</think>");
  if (start !== -1 && end >= start) {
    return {
      thinking: raw.slice(start + 7, end).trim(),
      answer: `${raw.slice(0, start)}${raw.slice(end + 8)}`.trim(),
    };
  }
  const answerStart = raw.lastIndexOf("\n\n");
  if (answerStart === -1 || !/^here'?s a thinking process:/i.test(raw.trim())) {
    return { thinking: "", answer: raw.replaceAll("<|channel>", "").trim() };
  }
  return {
    thinking: raw.slice(0, answerStart).trim(),
    answer: raw.slice(answerStart + 2).trim(),
  };
}

function renderReply(node, reasoning, reasoningText, raw, showThinking) {
  const split = splitThinking(raw);
  node.textContent = split.answer || raw.replaceAll("<|channel>", "").trim();
  if (split.thinking && showThinking) {
    reasoningText.textContent = split.thinking;
  } else {
    reasoning.remove();
  }
  if (node.textContent && !node.isConnected) ui.messages.append(node);
}

function addMetrics(node, metrics) {
  if (!metrics?.tokens) return;
  const line = document.createElement("small");
  line.className = "message-metrics";
  line.textContent = `${metrics.tokens} tok · ${metrics.tps.toFixed(1)} tok/s · TTFT ${metrics.ttft?.toFixed(1) ?? "—"}s`;
  node.after(line);
}

function activeTools() {
  const tools = [];
  if (ui.read.checked) tools.push("read");
  if (ui.grep.checked) tools.push("grep");
  if (ui.panels.checked) tools.push("panels");
  if (ui.bash.checked) tools.push("bash");
  return tools;
}

function promptMessages() {
  const tools = activeTools();
  const system = [ui.system.value.trim(), tools.length ? TOOL_PROTOCOL : ""]
    .filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, ...history];
}

function extractToolCall(text) {
  const match = text.match(/<function=(read|grep|panels|bash)>[\s\S]*?(?:<\/function>|<\/tool_call>|$)/i);
  if (!match || !activeTools().includes(match[1])) return null;
  const args = {};
  for (const entry of match[0].matchAll(/<parameter=(\w+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|<\/function>|$)/gi)) {
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

async function runPanelsTool(args) {
  const action = String(args.action || "").toLowerCase();
  if (action === "list") return JSON.stringify(await GearShell.panels.list(), null, 2);
  if (action === "open") {
    const component = args.component;
    if (!component) throw new Error("panels open requires component");
    return JSON.stringify(await GearShell.panels.open(component, {
      ...(args.direction ? { direction: args.direction } : {}),
    }));
  }
  if (action === "focus" || action === "close") {
    const id = args.id;
    if (!id) throw new Error(`panels ${action} requires id`);
    return JSON.stringify(await GearShell.panels[action](id));
  }
  throw new Error("panels action must be list, open, focus, or close");
}

async function runTool(call) {
  if (call.name === "panels") return runPanelsTool(call.args);
  if (call.name === "bash") {
    const command = call.args.command;
    if (!command) throw new Error("bash requires command");
    const result = await GearShell.bash.run(command, {
      ...(call.args.cwd ? { cwd: call.args.cwd } : {}),
      timeoutMs: 60000,
    });
    return result.output || result.error || "Command completed with no output.";
  }
  if (call.name === "read") {
    const path = call.args.path;
    if (!path) throw new Error("read requires path");
    try {
      const entries = await GearShell.fs.readDir(path);
      return entries.map((entry) => entry.isDirectory ? `${entry.name}/` : entry.name).join("\n");
    } catch {
      const text = await GearShell.fs.readFileText(path);
      return `${path}:\n${text.slice(0, 12000)}`;
    }
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

function waitForStream(sessionId, target, reasoningText, showThinking) {
  let finish;
  let raw = "";
  let metrics = null;
  let timer;
  const promise = new Promise((resolve, reject) => {
    const refreshTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error("Inference stream timed out.")), 120000);
    };
    refreshTimeout();
    const listener = (payload) => {
      if (payload?.sessionId !== sessionId) return;
      const event = payload.event;
      refreshTimeout();
      if (event?.type === "queued") status("Waiting for the shared inference host…", "loading");
      if (event?.type === "text" || event?.type === "thinking") {
        raw += event.delta;
        append(showThinking ? reasoningText : target, event.delta);
      }
      if (event?.type === "complete") metrics = event.result?.metrics ?? null;
      if (event?.type === "_error") finish(new Error(event.error));
      if (event?.type === "_end") finish();
    };
    finish = (error) => {
      clearTimeout(timer);
      GearShell.off("inference.event", listener);
      error ? reject(error) : resolve({ raw, metrics });
    };
    GearShell.on("inference.event", listener);
  });
  return promise;
}

async function generate(messages) {
  const showThinking = thinkEnabled;
  const reasoning = document.createElement("details");
  reasoning.className = "message reasoning";
  reasoning.open = true;
  reasoning.innerHTML = "<summary>Reasoning</summary><pre></pre>";
  const reasoningText = reasoning.querySelector("pre");
  const answer = document.createElement("article");
  answer.className = "message assistant";
  const stream = waitForStream(session.id, answer, reasoningText, showThinking);
  await GearShell.inference.send(session.id, messages, { think: showThinking });
  const result = await stream;
  if (showThinking && reasoningText.textContent && !reasoning.isConnected) {
    ui.messages.append(reasoning);
  }
  if (answer.textContent && !answer.isConnected) ui.messages.append(answer);
  return { answer, reasoning, reasoningText, showThinking, text: result.raw, metrics: result.metrics };
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
    for (let round = 0; round < 8; round += 1) {
      renderReply(generated.answer, generated.reasoning, generated.reasoningText, reply, generated.showThinking);
      addMetrics(generated.answer, generated.metrics);
      const call = extractToolCall(reply);
      if (!call) break;
      const toolCard = addMessage("tool", `Using ${call.name}…`);
      const result = await runTool(call);
      toolCard.textContent = `${call.name} result\n${result.slice(0, 12000)}`;
      history.push({ role: "assistant", content: reply });
      history.push({
        role: "user",
        content: `Tool result for ${call.name}:\n${result}\n\nContinue the original task. You may call another enabled tool if needed.`,
      });
      generated = await generate(promptMessages());
      reply = generated.text;
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
  const host = await GearShell.inference.status();
  if (host.state !== "ready") status("Loading model for your message…", "loading");
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
ui.model.addEventListener("change", () => {
  if (sending) return;
  modelId = ui.model.value;
  resetChat().catch((error) => status(error.message, "error"));
});
ui.think.addEventListener("click", () => {
  thinkEnabled = !thinkEnabled;
  ui.think.setAttribute("aria-pressed", String(thinkEnabled));
});
ui.load.addEventListener("click", () => loadModel().catch((error) => { ui.load.disabled = false; status(error.message, "error"); }));
ui.newChat.addEventListener("click", () => resetChat().catch((error) => status(error.message, "error")));
ui.stop.addEventListener("click", () => session && GearShell.inference.abort(session.id));
window.addEventListener("pagehide", () => session && GearShell.inference.closeSession(session.id).catch(() => {}));
boot().catch((error) => status(error.message, "error"));
