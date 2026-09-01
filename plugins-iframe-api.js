// plugins-iframe-api.js — shell side of the iframe <-> GearShell bridge.
//
// The counterpart of /plugin/gear-bridge.js: receives postMessage requests from
// registered iframe plugins and dispatches them against window.GearShell
// through the same permissions.api whitelist in-page component plugins
// get (createScopedApi). Both the source origin and the requested method
// path must pass before anything is called:
//
//   iframe -> shell  { gear: { id, method: "music.play", args: [] } }
//   shell  -> iframe { gear: { id, ok, result } }
//   shell  -> iframe { gear: { event: { topic, payload } } }   (push)
//
// The subscribe/unsubscribe methods are bridge channels, not API paths:
// they open a shell-side events.on listener and forward pushes to the
// iframe (callbacks cannot cross postMessage, so the iframe pairs them
// with its own local GearShell.on/off table). Channels close when the
// iframe unsubscribes or its page unloads.

import { createScopedApi, permitsPath } from "./plugins-scope.js";
import { workspaceApi } from "./workspace-api.js";
import { listPluginIframes } from "./plugins.js";
import { on as onEvent, off as offEvent } from "./workspace-events.js";
import { dispatchTerminalCall, dispatchVmCall } from "./workspace-terminal-bridge.js";

// origin|topic -> unsubscribe fn (from workspace-events on())
const subscriptions = new Map();

// Whitelist: the sender must be the window of one of OUR iframe panels
// (event.source is a WindowProxy, identical to the <iframe> element's
// contentWindow even across origins), and its src must match a
// registered iframe plugin's src. Origin-only matching would collapse
// for same-origin plugins (every relative src shares the shell's
// origin), so the element identity + src pair is the discriminator.
function iframeElementForSource(source) {
  if (typeof document === "undefined") return null;
  for (const el of document.querySelectorAll("iframe")) {
    if (el.contentWindow === source) return el;
  }
  return null;
}

function pluginForIframeElement(el) {
  let elHref = null;
  try {
    elHref = new URL(el.src).href;
  } catch {
    return null;
  }
  for (const { component, src, manifest } of listPluginIframes()) {
    let entryHref = null;
    try {
      entryHref = new URL(src, window.location.href).href;
    } catch {
      continue;
    }
    if (entryHref === elHref) {
      return { component, manifest };
    }
  }
  return null;
}

function getIframePluginForSender(source) {
  const element = iframeElementForSource(source);
  if (!element) return null;
  return pluginForIframeElement(element);
}

// Walk the dotted path over a (scoped) proxy, one property at a time so
// the createScopedApi get trap resolves each segment. Returns
// { missing: true } when any segment is undefined (unknown method) or
// { value } otherwise. Non-function values (e.g. GearShell.version) are
// returned as-is — the iframe bridge calls them like methods.
function resolveScopedPath(scoped, path) {
  let value = scoped;
  for (const key of path.split(".")) {
    if (value === undefined) return { missing: true };
    try {
      value = value[key];
    } catch {
      return { missing: true };
    }
  }
  return value === undefined ? { missing: true } : { value };
}

function reply(source, origin, payload) {
  try {
    source.postMessage({ gear: payload }, origin);
  } catch {
    // The result (or the iframe's window) is gone; drop the reply.
  }
}

function handleSubscribe(event, id, args) {
  const topic = String(args?.[0] || "");
  if (!topic) {
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: "subscribe requires a topic",
    });
  }
  const key = event.origin + "|" + topic;
  if (!subscriptions.has(key)) {
    const off = onEvent(topic, (payload) => {
      reply(event.source, event.origin, { event: { topic, payload } });
    });
    subscriptions.set(key, off);
  }
  reply(event.source, event.origin, { id, ok: true, result: { topic } });
}

function handleUnsubscribe(event, id, args) {
  const topic = String(args?.[0] || "");
  const key = event.origin + "|" + topic;
  const off = subscriptions.get(key);
  if (off) {
    off();
    subscriptions.delete(key);
  }
  reply(event.source, event.origin, { id, ok: true });
}

async function handleCall(event, g, plugin) {
  const { id, method, args } = g;
  const allow = plugin.manifest?.permissions?.api || [];
  if (!permitsPath(allow, method)) {
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: `permission denied: ${method}`,
    });
  }
  const scoped = createScopedApi(workspaceApi, allow);
  const resolved = resolveScopedPath(scoped, method);
  if (resolved.missing) {
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: `unknown method: ${method}`,
    });
  }
  if (typeof resolved.value !== "function") {
    // Non-function value (version, a static string): return it as the
    // result so `await GearShell.version()` mirrors the real surface.
    return reply(event.source, event.origin, {
      id,
      ok: true,
      result: resolved.value,
    });
  }
  let result;
  try {
    result = await resolved.value(...(Array.isArray(args) ? args : []));
  } catch (error) {
    return reply(event.source, event.origin, {
      id,
      ok: false,
      error: error?.message || String(error),
    });
  }
  reply(event.source, event.origin, { id, ok: true, result });
}

// Handle one { gear: {...} } message from an iframe plugin window.
export function handleGearMessage(event) {
  const gear = event.data && event.data.gear;
  if (!gear || typeof gear.id === "undefined" || typeof gear.method !== "string") {
    return;
  }
  // Whitelist: the sender must be a registered iframe plugin's window
  // (element identity + src match). Unknown senders are dropped
  // silently, never replied to, so the sender cannot probe the listener.
  const plugin = getIframePluginForSender(event.source);
  if (!plugin) return;
  if (gear.method === "subscribe") {
    return handleSubscribe(event, gear.id, gear.args);
  }
  if (gear.method === "unsubscribe") {
    return handleUnsubscribe(event, gear.id, gear.args);
  }
  // Terminal data methods are iframe-only by design (they need the
  // event context to stream output back to the creating iframe; the
  // in-page terminal.embed is DOM-based and cannot cross postMessage).
  // Permission checking happens inside the terminal bridge. vm.* methods
  // spawn a VM in the host kernel and reuse the same session plumbing.
  if (gear.method.startsWith("terminal.")) {
    return dispatchTerminalCall(event, gear, plugin);
  }
  if (gear.method.startsWith("vm.")) {
    return dispatchVmCall(event, gear, plugin);
  }
  handleCall(event, gear, plugin);
}

// Wire the bridge into the page. Call once from app.js after
// initWorkspaceApi() so window.GearShell exists for dispatch.
export function initIframePluginApi() {
  window.addEventListener("message", handleGearMessage);
}

export default initIframePluginApi;
