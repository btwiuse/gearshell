// Terminal session management: the persistent terminal layer, overlay
// attach/detach, and per-session wanix-task/wanix-term wiring (500-line
// rule split).

import { terminalLayer, terminalSessions, getWanixRoot, systemReady } from "./app-state.js?v=20260825.2";
import { getDefaultTerminalProfile, terminalCommand, buildEnv } from "./app-terminal-profiles.js?v=20260825.2";
import { DEFAULT_CMD } from "./app-constants.js?v=20260825.2";

export function hideTerminalLayer() {
  terminalLayer?.classList.add('dragging');
}

document.addEventListener('dragstart', (event) => {
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}, true);

export function hideTerminalLayerForTouch(event) {
  if (event.type === 'pointerdown' && event.pointerType !== 'touch') return;
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}

// Pointer drag targets sit below the persistent terminal layer. Hide it before
// the long-press drag begins so Home can be dropped onto a terminal pane too.
document.addEventListener('pointerdown', hideTerminalLayerForTouch, true);
document.addEventListener('touchstart', hideTerminalLayerForTouch, true);

export function restoreTerminalLayer() {
  terminalLayer?.classList.remove('dragging');
}

// Dockview consumes the bubbling end/drop events while completing a native tab
// drag. Listen in capture phase so the preview state cannot get stuck hidden.
document.addEventListener('dragend', restoreTerminalLayer, true);
document.addEventListener('drop', restoreTerminalLayer, true);
document.addEventListener('pointerup', restoreTerminalLayer, true);
document.addEventListener('pointercancel', restoreTerminalLayer, true);
document.addEventListener('touchend', restoreTerminalLayer, true);
document.addEventListener('touchcancel', restoreTerminalLayer, true);
window.addEventListener('blur', restoreTerminalLayer);


export let terminalIdCounter = 0;

export function createTerminalSession(id, profile = getDefaultTerminalProfile()) {
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-session';
  const waitsForSystemReady = !systemReady;

  const task = document.createElement('wanix-task');
  task.id = `repl-${id}`;
  task.setAttribute('cmd', terminalCommand(profile) || DEFAULT_CMD);
  task.setAttribute('type', profile.type || 'gojs');
  task.setAttribute('env', buildEnv(profile.env));
  if (profile.wd) task.setAttribute('wd', profile.wd);
  task.setAttribute('term', '');
  task.setAttribute('start', '');
  task.setAttribute('for', 'wanix-system');

  const winchBind = document.createElement('wanix-bind');
  winchBind.setAttribute('dst', 'winch');
  winchBind.setAttribute('src', '#task/self/term/winch');
  task.appendChild(winchBind);

  // Per-task extra binds (any mix of ns/file/fetch/archive). Profiles use
  // this to attach a private file into the task namespace without having
  // to round-trip through the wanix kernel writeFile API. Bind `dst`
  // paths must be relative — wanix-bind rejects leading slashes — and
  // are mounted inside the task's own namespace.
  if (Array.isArray(profile.extraBinds)) {
    for (const bind of profile.extraBinds) {
      if (!bind || typeof bind.dst !== 'string' || !bind.dst) continue;
      const element = document.createElement('wanix-bind');
      element.setAttribute('dst', bind.dst);
      if (bind.type) element.setAttribute('type', bind.type);
      if (bind.src) element.setAttribute('src', bind.src);
      if (bind.mode) element.setAttribute('perm', bind.mode);
      if (bind.union) element.setAttribute('union', bind.union);
      if (typeof bind.content === 'string') element.textContent = bind.content;
      task.appendChild(element);
    }
  }

  const term = document.createElement('wanix-term');
  term.setAttribute('raw', '');
  term.setAttribute('no-scrollbar', '');
  term.setAttribute('path', `#task/repl-${id}/term`);
  term.setAttribute('for', 'wanix-system');

  wrapper.append(task, term);
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
    waitsForSystemReady,
    autoActivates: '_connectStarted' in task,
  };
  terminalSessions.set(id, session);
  return session;
}

export function getTerminalSession(id, profile) {
  return terminalSessions.get(id) || createTerminalSession(id, profile);
}

export function destroyTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  terminalSessions.delete(id);
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
    session.wrapper.classList.remove('visible');
    session.layout = null;
    return;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove('visible');
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
  const layoutChanged = !previousLayout || Object.keys(nextLayout).some((key) =>
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
  session.wrapper.classList.add('visible');
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
      !session.wrapper.classList.contains('visible')
    ) return;
    session.term._term?.focus();
  };
  if (deferred) requestAnimationFrame(focus);
  else focus();
}

export function attachOverlayTerminalSession(session, anchor, api) {
  let updateFrame = 0;

  const update = () => {
    updateFrame = 0;
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 && bounds.height > 0;
    layoutTerminalSession(session, anchor, isVisible);
    if (isVisible) {
      requestAnimationFrame(() => {
        const currentBounds = anchor.getBoundingClientRect();
        if (session.anchor === anchor && currentBounds.width > 0 && currentBounds.height > 0) {
          const needsFocusAfterWake = !session.started && api.isActive;
          wakeTerminalSession(session);
          if (needsFocusAfterWake) {
            requestAnimationFrame(() => focusTerminalSession(session, anchor, api, false));
          }
        }
      });
    }
  };
  const scheduleUpdate = () => {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(anchor);
  // The overlay wrapper is positioned inside the shared terminal-layer using
  // the anchor's viewport coordinates. Anything that scrolls between the
  // anchor and the layer shifts the anchor without firing ResizeObserver,
  // so without these listeners the overlay detaches whenever a panel
  // scrolls. Walk up the tree and subscribe to every scrollable ancestor
  // plus the window so both panel-internal and page-level scrolling are
  // covered.
  const scrollListeners = [];
  const trackScrollParent = (parent) => {
    if (!parent || parent === session.wrapper) return;
    const style = getComputedStyle(parent);
    const overflows = [style.overflow, style.overflowX, style.overflowY];
    if (overflows.some((value) => value === 'auto' || value === 'scroll' || value === 'overlay')) {
      parent.addEventListener('scroll', scheduleUpdate, { passive: true });
      scrollListeners.push(parent);
    }
  };
  let scrollParent = anchor.parentElement;
  while (scrollParent) {
    trackScrollParent(scrollParent);
    scrollParent = scrollParent.parentElement;
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  scrollListeners.push(window);
  const focusFromTerminalInteraction = () => {
    if (!api.isActive) {
      api.setActive();
      focusTerminalSession(session, anchor, api);
      return;
    }
    focusTerminalSession(session, anchor, api, false);
  };
  session.wrapper.addEventListener('pointerdown', focusFromTerminalInteraction);
  session.wrapper.addEventListener('touchstart', focusFromTerminalInteraction, { passive: true });
  const subscriptions = [
    api.onDidDimensionsChange(scheduleUpdate),
    api.onDidActiveChange((event) => {
      scheduleUpdate();
      if (event.isActive) focusTerminalSession(session, anchor, api);
    }),
    api.onDidFocusChange((event) => {
      if (event.isFocused) focusTerminalSession(session, anchor, api);
    }),
    api.onDidVisibilityChange(scheduleUpdate),
    api.onDidLocationChange(scheduleUpdate),
    api.onDidGroupChange(scheduleUpdate),
  ];

  scheduleUpdate();
  if (api.isActive) focusTerminalSession(session, anchor, api);

  return () => {
    observer.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
    session.wrapper.removeEventListener('pointerdown', focusFromTerminalInteraction);
    session.wrapper.removeEventListener('touchstart', focusFromTerminalInteraction);
    for (const subscription of subscriptions) subscription.dispose();
    for (const target of scrollListeners) {
      target.removeEventListener('scroll', scheduleUpdate);
    }
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutTerminalSession(session, null, false);
    }
  };
}

export function attachTerminalSession(id, profile, anchor, api) {
  return attachOverlayTerminalSession(getTerminalSession(id, profile), anchor, api);
}

