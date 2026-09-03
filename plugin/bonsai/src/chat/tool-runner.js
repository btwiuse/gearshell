// Run one model turn end to end, including multi-round tool execution.
//
// The model streams thinking / text / tool_call events from
// `chat.streamTurn`. Whenever it emits tool_call events we execute them,
// push role:tool messages back into the history, and continue streaming
// until the assistant stops without asking for another tool.
import { executeToolCall, getGearShellTools } from "./tools.js";

export function appendToolCallCard(turn, call) {
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
  return status;
}

export function buildStreamTools() {
  return getGearShellTools();
}

export async function runToolRound(turn, calls) {
  const results = [];
  for (const call of calls) {
    const status = appendToolCallCard(turn, call);
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

export async function streamAssistantRound(chat, messages, turn, options) {
  const { consumeTurnEvent, ...streamOptions } = options;
  const calls = [];
  for await (const event of chat.streamTurn(messages, streamOptions)) {
    if (event.type === "tool_call") calls.push(event.call);
    else if (turn) consumeTurnEvent(event, turn);
  }
  return calls;
}
