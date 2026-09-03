// Render historical assistant and tool messages as plain DOM nodes.
//
// The chat-thread module is the only place that knows how a turn looks
// today, so this lives there to keep the rendering contract tight.
import { renderAnswer } from "./markdown.js";

export function appendHistoricalAssistant(cThread, text) {
  const msg = document.createElement("div");
  msg.className = "c-msg bot";
  msg.innerHTML = `<div class="c-role">BONSAI</div><div class="a-body"></div>`;
  const body = msg.querySelector(".a-body");
  cThread.appendChild(msg);
  renderAnswer(body, text, false);
}

export function appendHistoricalTool(cThread, record) {
  const card = document.createElement("div");
  card.className = "c-tool-call";
  const name = document.createElement("div");
  name.className = "c-tool-name";
  name.textContent = `CALLING ${record.name ?? "tool"}`;
  const detail = document.createElement("pre");
  detail.className = "c-tool-detail";
  detail.textContent = JSON.stringify({ args: [] }, null, 2);
  const status = document.createElement("div");
  status.className = "c-tool-status";
  status.textContent = "COMPLETE";
  card.append(name, detail, status);
  cThread.appendChild(card);
}
