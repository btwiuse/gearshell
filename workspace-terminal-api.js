// workspace-terminal-api.js — the terminal embed surface of
// window.GearShell (a per-domain part assembled in workspace-api.js).
//
// `terminal.embed(anchor, profile?)` mounts a real wanix terminal into a
// caller-supplied DOM element — a plugin panel's ref, a home demo frame,
// anything in-page. It mirrors the Terminal panel's attach path exactly
// (createTerminalSession + attachTerminalSession), so the embedded
// terminal behaves like a panel terminal: kernel task + xterm overlay,
// auto-focus, layout tracking, destroy on cleanup.
//
// Sync-only, like the rest of the jsfs-bridged surface: the functions
// create DOM and return handles synchronously. The returned `detach` is
// a function, which JSON.stringify drops over the agent bridge — that is
// fine, because embedding only makes sense for in-page (T1) callers; an
// agent driving this through /js would just get the sessionId.

import { getDockviewApi } from "./app-panels-store.js?v=20260826.126";
import {
  attachTerminalSession,
  destroyTerminalSession,
} from "./app-terminal-sessions.js?v=20260826.126";

let embedCounter = 0;

export function embedTerminal(anchor, profile) {
  if (!anchor || typeof anchor.appendChild !== "function") {
    throw new Error("terminal.embed requires a DOM element");
  }
  const api = getDockviewApi();
  if (!api) {
    throw new Error("terminal.embed requires a mounted dockview");
  }
  const sessionId = `embed-${++embedCounter}`;
  // attachTerminalSession returns the overlay detach; the caller's
  // cleanup also destroys the underlying session (kills the wanix task).
  let detachOverlay;
  try {
    detachOverlay = attachTerminalSession(sessionId, profile, anchor, api);
  } catch (error) {
    // The session (wrapper + wanix-task + gojs worker) is created before
    // the overlay attach finishes; if that throws, destroy the session so
    // the task and its worker do not leak and accumulate memory.
    destroyTerminalSession(sessionId);
    throw error;
  }
  return {
    sessionId,
    detach: () => {
      detachOverlay();
      destroyTerminalSession(sessionId);
    },
  };
}

export const terminalApi = {
  embed: embedTerminal,
};
