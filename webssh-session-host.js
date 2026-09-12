import {
  exitExternalTerminal,
  onExternalTerminalInput,
  onExternalTerminalResize,
  promptExternalTerminal,
  setExternalTerminalDispose,
  writeExternalTerminal,
} from "./external-terminal-sessions.js";

const WORKER_URL = new URL("./plugin/webssh/session-worker.js", import.meta.url);

function relayPrompt(worker, sessionId, message) {
  promptExternalTerminal(sessionId, message.prompt)
    .then((value) => worker.postMessage({ type: "response", id: message.id, value }))
    .catch(() => worker.postMessage({ type: "response", id: message.id, value: null }));
}

export function startWebSshSession(sessionId, config) {
  const worker = new Worker(WORKER_URL);
  const offInput = onExternalTerminalInput(sessionId, (data) => {
    const input = data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
    worker.postMessage({ type: "input", data: input });
  });
  const offResize = onExternalTerminalResize(sessionId, (payload) => {
    worker.postMessage({ type: "resize", payload: { ...payload, type: "resize" } });
  });
  const dispose = () => {
    offInput();
    offResize();
    worker.postMessage({ type: "close" });
    worker.terminate();
  };
  setExternalTerminalDispose(sessionId, dispose);
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "output") writeExternalTerminal(sessionId, message.data);
    if (message?.type === "prompt") relayPrompt(worker, sessionId, message);
    if (message?.type === "exit") exitExternalTerminal(sessionId, message.payload);
  });
  worker.postMessage({ type: "start", config });
}
