// app-terminal-overlay.js — terminal overlay attach/detach machinery
// (500-line rule split out of app-terminal-sessions.js): pane positioning,
// focus, scroll tracking, and dockview event subscriptions. The session
// lifecycle (createTerminalSession / wake / destroy) stays in the main
// module; this one only wires a session element onto a dockview anchor.

import { terminalLayer } from "./app-state.js?v=20260826.2";
import {
  getTerminalSession,
  wakeTerminalSession,
} from "./app-terminal-sessions.js?v=20260826.168";

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

