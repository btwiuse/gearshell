import { createExternalTerminal } from "./external-terminal-sessions.js";

const adapters = new Map();

export function registerExternalTerminalRecovery(kind, restore) {
  adapters.set(kind, restore);
}

export function restoreExternalTerminalSessions(api) {
  for (const panel of api.panels) {
    if (panel.params?.panelType !== "external-terminal") continue;
    const recovery = panel.params.recovery;
    const restore = adapters.get(recovery?.kind);
    if (!restore) continue;
    createExternalTerminal({ sessionId: panel.params.sessionId, title: panel.title });
    restore({ sessionId: panel.params.sessionId, recovery });
  }
}
