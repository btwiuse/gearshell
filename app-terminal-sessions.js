// Terminal session management: the persistent terminal layer, overlay
// attach/detach, and per-session wanix-task/wanix-term wiring (500-line
// rule split).

import {
  getWanixRoot,
  systemReady,
  terminalLayer,
  terminalSessions,
} from "./app-state.js?v=20260826.2";
import {
  buildEnv,
  getDefaultTerminalProfile,
  terminalCommand,
} from "./app-terminal-profiles.js?v=20260826.146";
import { DEFAULT_CMD } from "./app-constants.js?v=20260828.105";
import { loadActiveWorkspace } from "./app-workspace.js?v=20260826.146";
import { cachedBlobUrl } from "./app-plugin-cache.js?v=20260830.2";
import { html } from "./dom-html.js?v=20260830.4";

export function hideTerminalLayer() {
  terminalLayer?.classList.add("dragging");
}

document.addEventListener("dragstart", (event) => {
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}, true);

export function hideTerminalLayerForTouch(event) {
  if (event.type === "pointerdown" && event.pointerType !== "touch") return;
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}

// Pointer drag targets sit below the persistent terminal layer. Hide it before
// the long-press drag begins so Home can be dropped onto a terminal pane too.
document.addEventListener("pointerdown", hideTerminalLayerForTouch, true);
document.addEventListener("touchstart", hideTerminalLayerForTouch, true);

export function restoreTerminalLayer() {
  terminalLayer?.classList.remove("dragging");
}

// Dockview consumes the bubbling end/drop events while completing a native tab
// drag. Listen in capture phase so the preview state cannot get stuck hidden.
document.addEventListener("dragend", restoreTerminalLayer, true);
document.addEventListener("drop", restoreTerminalLayer, true);
document.addEventListener("pointerup", restoreTerminalLayer, true);
document.addEventListener("pointercancel", restoreTerminalLayer, true);
document.addEventListener("touchend", restoreTerminalLayer, true);
document.addEventListener("touchcancel", restoreTerminalLayer, true);
window.addEventListener("blur", restoreTerminalLayer);

export let terminalIdCounter = 0;

export function createTerminalSession(
  id,
  profile = getDefaultTerminalProfile(),
) {
  const task = createTaskElement(id, profile);
  const term = html`<wanix-term
    raw=""
    no-scrollbar=""
    path=${`#task/repl-${id}/term`}
    for="wanix-system"
  />`;

  const wrapper = html`<div className="terminal-session">
    ${task}
    ${term}
  </div>`;
  terminalLayer?.appendChild(wrapper);

  const session = {
    id,
    wrapper,
    task,
    term,
    anchor: null,
    layout: null,
    started: false,
    profile,
    waitsForSystemReady: !systemReady,
    autoActivates: "_connectStarted" in task,
  };
  terminalSessions.set(id, session);
  // The process may exit on its own (a one-shot cmd, a bbtex example
  // quitting on q): surface the exit in the buffer instead of leaving a
  // blank/alt-screen terminal. For interactive shells the exit file
  // stays empty and the poll is a no-op until the session is destroyed.
  startReplExitPolling(session);
  return session;
}

// Poll the kernel exit file (task/repl-<id>/exit) for a repl/embed
// terminal session and write a VS Code-style notice once the process is
// gone. The poll is cheap (small ramfs file) and stops on the first
// non-empty exit value. The notice lands after the last output line
// (writeAtContentEnd); the kernel homes the cursor on process exit, so a
// bare writeln would overwrite the first line.
function startReplExitPolling(session) {
  const path = `task/repl-${session.id}/exit`;
  const poll = async () => {
    if (!terminalSessions.has(session.id)) return;
    let text;
    try {
      const root = getWanixRoot();
      if (!root) return;
      text = await root.readText(path);
    } catch {
      return;
    }
    if (text == null) return;
    const trimmed = text.trim();
    if (trimmed === "") return;
    stopReplExitPolling(session);
    const term = session.term?._term;
    if (term && typeof term.writeln === "function") {
      const notice = trimmed === "0"
        ? `[Process completed (exit code ${trimmed})]`
        : `[Process exited with code ${trimmed}]`;
      writeAtContentEnd(term, notice);
    }
  };
  poll();
  session._exitTimer = setInterval(poll, 500);
}

// Write a line at the end of the terminal's existing content. The kernel
// homes the cursor when a task process exits (and apps that used the
// alternate screen leave it frozen), so the current cursor position is
// unreliable - find the last non-empty buffer row and write there.
function writeAtContentEnd(term, text) {
  const buffer = term.buffer?.active || term._buffer?.active || term._core?.buffer?.active;
  let row = null;
  if (buffer && typeof buffer.getLine === "function") {
    const viewportRows = buffer.rows || 24;
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      // row tracks the 1-based line AFTER the last content line
      if (line && line.translateToString(true).trim() !== "") row = i + 2;
    }
    // The visible screen is at most the viewport tall; content that
    // scrolled away is already above it, so clamp to the bottom row.
    if (row === null) row = 1;
    if (row > viewportRows) row = viewportRows;
  }
  if (row !== null) term.write(`\x1b[${row};1H`);
  term.writeln(text);
}

function stopReplExitPolling(session) {
  if (session._exitTimer) clearInterval(session._exitTimer);
  session._exitTimer = null;
}

function createTaskElement(id, profile) {
  const task = html`<wanix-task
    id=${`repl-${id}`}
    cmd=${terminalCommand(profile) || DEFAULT_CMD}
    type=${profile.type || "gojs"}
    env=${buildEnv(profile.env)}
    wd=${profile.wd || null}
    term=""
    start=""
    for="wanix-system"
  >
    <wanix-bind dst="winch" src="#task/self/term/winch" />
  </wanix-task>`;

  appendWorkspaceBinds(task, profile);
  appendExtraBinds(task, profile);
  return task;
}

// Append one bind declaration as a <wanix-bind> child of the task.
// `permKey` selects the permission attribute: workspace binds carry
// `perm`, profile extraBinds use `mode`.
function appendBindElement(task, bind, permKey) {
  if (!bind || typeof bind.dst !== "string" || !bind.dst) return;
  // Fetch binds prefer the OPFS-cached copy (a session blob URL) when
  // priming already downloaded it; otherwise keep the origin src.
  const cached = bind.src && bind.type === "fetch"
    ? cachedBlobUrl(bind.src)
    : null;
  const element = html`<wanix-bind
    dst=${bind.dst}
    type=${bind.type || null}
    src=${(bind.src && (cached || bind.src)) || null}
    perm=${bind[permKey] || null}
    union=${bind.union || null}
  >${typeof bind.content === "string" ? bind.content : null}</wanix-bind>`;
  task.appendChild(element);
}

// The per-task shell toolset (writable /bin + bash + w9y + gear, see
// ensureGearShellBinds): each terminal task declares its own private
// namespace view, the same way workspace-task panels and crushrc do.
// `profile.skipPluginBinds` drops every plugin-owned bind (ids starting
// with "plugin-"), so a task mounts only what its profile's extraBinds
// declares - embed callers that run a single known binary (e.g. one
// bbtex example) avoid pulling the whole plugin toolset and every wasm
// dep into their namespace (~100MB+ per task).
function appendWorkspaceBinds(task, profile) {
  for (const bind of loadActiveWorkspace().binds || []) {
    if (
      profile.skipPluginBinds &&
      typeof bind?.id === "string" &&
      bind.id.startsWith("plugin-")
    ) continue;
    appendBindElement(task, bind, "perm");
  }
}

// Per-task extra binds (any mix of ns/file/fetch/archive). Profiles use
// this to attach a private file into the task namespace without having
// to round-trip through the wanix kernel writeFile API. Bind `dst`
// paths must be relative - wanix-bind rejects leading slashes - and
// are mounted inside the task's own namespace.
function appendExtraBinds(task, profile) {
  for (const bind of profile.extraBinds || []) {
    appendBindElement(task, bind, "mode");
  }
}

export function getTerminalSession(id, profile) {
  return terminalSessions.get(id) || createTerminalSession(id, profile);
}

export function destroyTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  terminalSessions.delete(id);
  stopReplExitPolling(session);
  session.anchor = null;
  session.wrapper.remove();
}

export function wakeTerminalSession(session) {
  if (!systemReady || session.started) return;
  session.started = true;
  // Current Wanix namespace emits `ready` to child elements created before the
  // system booted. Let that listener start the first shell. Elements created
  // after boot miss that event and need the explicit wake below. Newer Wanix
  // runtimes self-activate, so they never need it.
  if (session.waitsForSystemReady || session.autoActivates) return;
  queueMicrotask(() => {
    session.task._awake?.();
    session.term._awake?.();
  });
}

export function layoutTerminalSession(session, anchor, isVisible) {
  if (!terminalLayer || !anchor || !isVisible) {
    session.wrapper.classList.remove("visible");
    session.layout = null;
    return;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove("visible");
    session.layout = null;
    return;
  }

  const nextLayout = {
    left: bounds.left - layerBounds.left,
    top: bounds.top - layerBounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  const previousLayout = session.layout;
  const layoutChanged = !previousLayout ||
    Object.keys(nextLayout).some((key) =>
      Math.abs(nextLayout[key] - previousLayout[key]) >= 0.5
    );
  const sizeChanged = !previousLayout ||
    Math.abs(nextLayout.width - previousLayout.width) >= 0.5 ||
    Math.abs(nextLayout.height - previousLayout.height) >= 0.5;

  if (layoutChanged) {
    session.wrapper.style.left = `${nextLayout.left}px`;
    session.wrapper.style.top = `${nextLayout.top}px`;
    session.wrapper.style.width = `${nextLayout.width}px`;
    session.wrapper.style.height = `${nextLayout.height}px`;
    session.layout = nextLayout;
  }
  session.wrapper.classList.add("visible");
  if (sizeChanged) {
    requestAnimationFrame(() => {
      if (!session.wrapper.isConnected) return;
      session.term._fitAddon?.fit();
    });
  }
}

export function focusTerminalSession(session, anchor, api, deferred = true) {
  const focus = () => {
    if (
      session.anchor !== anchor ||
      !api.isActive ||
      !session.wrapper.classList.contains("visible")
    ) return;
    session.term._term?.focus();
  };
  if (deferred) requestAnimationFrame(focus);
  else focus();
}

// Attach the overlay's DOM listeners: the ResizeObserver on the anchor,
// scroll-parent tracking, and focus-on-interaction on the wrapper.
function attachOverlayListeners(
  { session, anchor, api, scheduleUpdate, focus },
) {
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  // The overlay wrapper is positioned inside the shared terminal-layer using
  // the anchor's viewport coordinates. Anything that scrolls between the
  // anchor and the layer shifts the anchor without firing ResizeObserver,
  // so without these listeners the overlay detaches whenever a panel
  // scrolls. Walk up the tree and subscribe to every scrollable ancestor
  // plus the window so both panel-internal and page-level scrolling are
  // covered.
  const scrollListeners = trackScrollParents(
    anchor,
    session.wrapper,
    scheduleUpdate,
  );
  const focusFromTerminalInteraction = () => {
    if (!api.isActive) {
      // Panel terminals carry a dockview panel api (setActive exists);
      // embedded terminals carry the dockview instance api, where there
      // is no panel to activate - focus the terminal either way.
      if (typeof api.setActive === "function") api.setActive();
      focus();
      return;
    }
    focus(false);
  };
  session.wrapper.addEventListener("pointerdown", focusFromTerminalInteraction);
  session.wrapper.addEventListener("touchstart", focusFromTerminalInteraction, {
    passive: true,
  });
  const subscriptions = subscribeOverlayEvents(
    session,
    anchor,
    api,
    scheduleUpdate,
    focus,
  );
  return {
    observer,
    scrollListeners,
    focusFromTerminalInteraction,
    subscriptions,
  };
}

function disposeOverlay({
  session,
  anchor,
  observer,
  updater,
  scheduleUpdate,
  subscriptions,
  scrollListeners,
  focusFromTerminalInteraction,
}) {
  observer.disconnect();
  updater.cancelUpdateFrame();
  session.wrapper.removeEventListener(
    "pointerdown",
    focusFromTerminalInteraction,
  );
  session.wrapper.removeEventListener(
    "touchstart",
    focusFromTerminalInteraction,
  );
  for (const subscription of subscriptions) subscription.dispose();
  for (const target of scrollListeners) {
    target.removeEventListener("scroll", scheduleUpdate);
  }
  if (session.anchor === anchor) {
    session.anchor = null;
    layoutTerminalSession(session, null, false);
  }
}

export function attachOverlayTerminalSession(session, anchor, api) {
  const focus = (deferred) =>
    focusTerminalSession(session, anchor, api, deferred);
  const updater = createOverlayUpdater(session, anchor, api, focus);
  const { scheduleUpdate } = updater;
  const overlay = attachOverlayListeners({
    session,
    anchor,
    api,
    scheduleUpdate,
    focus,
  });
  scheduleUpdate();
  if (api.isActive) focus();

  return () =>
    disposeOverlay({
      session,
      anchor,
      observer: overlay.observer,
      updater,
      scheduleUpdate,
      subscriptions: overlay.subscriptions,
      scrollListeners: overlay.scrollListeners,
      focusFromTerminalInteraction: overlay.focusFromTerminalInteraction,
    });
}

function createOverlayUpdater(session, anchor, api, focus) {
  let updateFrame = 0;
  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 &&
      bounds.height > 0;
    layoutTerminalSession(session, anchor, isVisible);
    if (isVisible) {
      requestAnimationFrame(() => {
        const currentBounds = anchor.getBoundingClientRect();
        if (
          session.anchor === anchor && currentBounds.width > 0 &&
          currentBounds.height > 0
        ) {
          const needsFocusAfterWake = !session.started && api.isActive;
          wakeTerminalSession(session);
          if (needsFocusAfterWake) requestAnimationFrame(() => focus(false));
        }
      });
    }
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  return {
    update,
    scheduleUpdate,
    cancelUpdateFrame: () => cancelAnimationFrame(updateFrame),
  };
}

function trackScrollParents(anchor, wrapper, scheduleUpdate) {
  const scrollListeners = [];
  const trackScrollParent = (parent) => {
    if (!parent || parent === wrapper) return;
    const style = getComputedStyle(parent);
    const overflows = [style.overflow, style.overflowX, style.overflowY];
    if (
      overflows.some((value) =>
        value === "auto" || value === "scroll" || value === "overlay"
      )
    ) {
      parent.addEventListener("scroll", scheduleUpdate, { passive: true });
      scrollListeners.push(parent);
    }
  };
  let scrollParent = anchor.parentElement;
  while (scrollParent) {
    trackScrollParent(scrollParent);
    scrollParent = scrollParent.parentElement;
  }
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  scrollListeners.push(window);
  return scrollListeners;
}

// Panel terminals carry the dockview panel api, which exposes the six
// onDid* subscriptions below. Embedded terminals (terminal.embed) carry
// the dockview instance api instead, where those panel-level events do
// not exist - their layout is tracked by the anchor ResizeObserver and
// scroll-parent listeners, so absent subscriptions are simply skipped.
function subscribeOverlayEvents(session, anchor, api, scheduleUpdate, focus) {
  const subscriptions = [];
  const subscribe = (name, handler) => {
    if (typeof api[name] === "function") subscriptions.push(api[name](handler));
  };
  subscribe("onDidDimensionsChange", scheduleUpdate);
  subscribe("onDidActiveChange", (event) => {
    scheduleUpdate();
    if (event.isActive) focus();
  });
  subscribe("onDidFocusChange", (event) => {
    if (event.isFocused) focus();
  });
  subscribe("onDidVisibilityChange", scheduleUpdate);
  subscribe("onDidLocationChange", scheduleUpdate);
  subscribe("onDidGroupChange", scheduleUpdate);
  return subscriptions;
}

export function attachTerminalSession(id, profile, anchor, api) {
  return attachOverlayTerminalSession(
    getTerminalSession(id, profile),
    anchor,
    api,
  );
}
