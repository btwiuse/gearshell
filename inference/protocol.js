// inference/protocol.js — message types between host <-> shell.
//
// Wire protocol summary:
//
//   shell -> host (request):
//     { id, type: "load",         model, options }
//     { id, type: "unload" }
//     { id, type: "createSession", model, options }
//     { id, type: "closeSession",  sessionId }
//     { id, type: "send",          sessionId, messages, options }
//     { id, type: "abort",         sessionId }
//     { id, type: "reset",         sessionId }
//     { id, type: "status" }
//
//   host -> shell (response / push):
//     { id, type: "ok",    result } | { id, type: "error", error }
//     { type: "progress", requestId, progress }
//     { type: "event",    sessionId, event }
//     { type: "status",   state }
//
// Streaming events flow on the push channel because one send() returns
// many events; the request id is needed only for the terminal ok/error
// reply that closes the request.

export const MAX_SESSIONS = 4;
export const SESSION_IDLE_MS = 10 * 60 * 1000;

export const REQUEST = Object.freeze({
  INIT: "init",
  LOAD: "load",
  UNLOAD: "unload",
  CREATE_SESSION: "createSession",
  CLOSE_SESSION: "closeSession",
  SEND: "send",
  ABORT: "abort",
  RESET: "reset",
  STATUS: "status",
});

export const PUSH = Object.freeze({
  PROGRESS: "progress",
  EVENT: "event",
  STATUS: "status",
});

export const HOST_STATE = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
});
