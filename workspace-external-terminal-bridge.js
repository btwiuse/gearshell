import { getDockviewApi } from "./app-panels-store.js";
import { permitsPath } from "./plugins-scope.js";
import { addPanelByComponent } from "./panels.js";
import { startWebSshSession } from "./webssh-session-host.js";
import {
  createExternalTerminal,
  disposeExternalTerminal,
  exitExternalTerminal,
  onExternalTerminalInput,
  onExternalTerminalResize,
  promptExternalTerminal,
  respondExternalTerminalPrompt,
  setExternalTerminalDispose,
  writeExternalTerminal,
} from "./external-terminal-sessions.js";

function reply(event, payload) {
  try { event.source.postMessage({ gear: payload }, event.origin); } catch {}
}

function allowed(plugin, method) {
  return permitsPath(plugin.manifest?.permissions?.api || [], method);
}

function requireTerminal(event, plugin, method) {
  if (allowed(plugin, method)) return true;
  reply(event, { id: event.data.gear.id, ok: false, error: `permission denied: ${method}` });
  return false;
}

function createTerminal(event) {
  const gear = event.data.gear;
  const title = gear.args?.[0]?.title || "External terminal";
  const entry = createExternalTerminal({ source: event.source, origin: event.origin, title });
  const panel = addPanelByComponent(getDockviewApi(), "external-terminal", undefined, {
    sessionId: entry.sessionId,
    title: entry.title,
  });
  reply(event, { id: gear.id, ok: true, result: { sessionId: entry.sessionId, panelId: panel?.id } });
}

function startWebSshTerminal(event) {
  const { id, args } = event.data.gear;
  const [sessionId, config] = args || [];
  try {
    startWebSshSession(sessionId, config || {});
    reply(event, { id, ok: true });
  } catch (error) {
    reply(event, { id, ok: false, error: error?.message || String(error) });
  }
}

function writeTerminal(event) {
  const { id, args } = event.data.gear;
  const [sessionId, data] = args || [];
  const output = typeof data === "string" ? data : data instanceof Uint8Array ? data : null;
  if (output == null) {
    return reply(event, { id, ok: false, error: "external terminal output requires text or Uint8Array" });
  }
  const ok = writeExternalTerminal(sessionId, output);
  reply(event, { id, ok, ...(ok ? {} : { error: "unknown external terminal" }) });
}

function exitTerminal(event) {
  const { id, args } = event.data.gear;
  const [sessionId, payload] = args || [];
  const ok = exitExternalTerminal(sessionId, payload);
  reply(event, { id, ok, ...(ok ? {} : { error: "unknown external terminal" }) });
}

async function promptTerminal(event) {
  const { id, args } = event.data.gear;
  const [sessionId, prompt] = args || [];
  try {
    const value = await promptExternalTerminal(sessionId, prompt);
    reply(event, { id, ok: true, result: value });
  } catch (error) {
    reply(event, { id, ok: false, error: error?.message || String(error) });
  }
}

function respondTerminalPrompt(event) {
  const { id, args } = event.data.gear;
  const ok = respondExternalTerminalPrompt(args?.[0], args?.[1]);
  reply(event, { id, ok, ...(ok ? {} : { error: "no pending terminal prompt" }) });
}

function disposeTerminal(event) {
  const { id, args } = event.data.gear;
  disposeExternalTerminal(args?.[0]);
  reply(event, { id, ok: true });
}

export function dispatchExternalTerminalCall(event, plugin) {
  const method = event.data.gear.method;
  if (!requireTerminal(event, plugin, method)) return;
  const action = method.slice("terminal.external.".length);
  if (action === "create") return createTerminal(event);
  if (action === "startWebSsh") return startWebSshTerminal(event);
  if (action === "write") return writeTerminal(event);
  if (action === "exit") return exitTerminal(event);
  if (action === "prompt") return promptTerminal(event);
  if (action === "respond") return respondTerminalPrompt(event);
  if (action === "dispose") return disposeTerminal(event);
  reply(event, { id: event.data.gear.id, ok: false, error: `unknown external terminal method: ${action}` });
}
