import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewReact } from 'dockview-react';

const debugMode = window.location.search.includes('debug');
let debugErrorsDismissed = false;

function showHomeDebugErrors() {
  if (!debugMode || debugErrorsDismissed) return;
  const errors = window.homeDebugErrors || [];
  if (errors.length === 0) return;
  for (const homeContent of document.querySelectorAll('.home-content')) {
    const output = homeContent.querySelector('.home-debug-errors');
    const dismiss = homeContent.querySelector('.home-debug-dismiss');
    if (!output) continue;
    output.textContent = errors.slice(-3).join('\n\n');
    output.hidden = false;
    if (dismiss) dismiss.hidden = false;
  }
}

function dismissHomeDebugErrors() {
  debugErrorsDismissed = true;
  for (const homeContent of document.querySelectorAll('.home-content')) {
    homeContent.querySelector('.home-debug-errors')?.setAttribute('hidden', '');
    homeContent.querySelector('.home-debug-dismiss')?.setAttribute('hidden', '');
  }
}

function reportHomeError(context, error) {
  console.error(context, error);
  if (!debugMode) return;
  const details = (error && (error.stack || error.message)) || String(error);
  window.homeDebugErrors = window.homeDebugErrors || [];
  window.homeDebugErrors.push(`${context}: ${details}`);
  showHomeDebugErrors();
}

if (debugMode) {
  window.addEventListener('error', () => requestAnimationFrame(showHomeDebugErrors));
  window.addEventListener('unhandledrejection', () => requestAnimationFrame(showHomeDebugErrors));
}

// --- Constants ---
const WANIX = '/opfs/wanix';
const HOME = '/opfs/home';
const HUSH_ENV = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  CLICOLOR_FORCE: '1',
  WANIX,
  HOME,
  PATH: `${HOME}/go/bin:${WANIX}`,
  GOPROXY: 'https://goproxy.up.railway.app',
  GONOSUMDB: '*',
  CRUSH_CORE_UTILS: '1',
  DO_NOT_TRACK: '1',
  CRUSH_DISABLE_PROVIDER_AUTO_UPDATE: '1',
  TERM_WINCH: '/winch',
  LOCATION: window.location.pathname,
  GOMEMLIMIT: '384MiB',
  GOGC: '70',
};
const DEFAULT_CMD = 'hush -rcfile /tmp/profile';
const CONFIG_KEY = 'gear-shell-config';
const DEFAULT_CONFIG = { cmd: DEFAULT_CMD, env: '', autoOpen: true };

// --- Config ---
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
    return { ...DEFAULT_CONFIG, ...saved };
  } catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}
function buildEnv() {
  const cfg = loadConfig();
  const env = { ...HUSH_ENV };
  if (cfg.env.trim()) {
    for (const line of cfg.env.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        const [key, ...rest] = trimmed.split('=');
        if (key) env[key] = rest.join('=');
      }
    }
  }
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ');
}

// --- Terminal ID counter ---
let terminalIdCounter = 0;

// wanix elements inside dockview need an explicit system reference because
// dockview isolates panel content from the wanix-system ancestor.
const wanixSystem = document.getElementById('wanix-system');
let systemReady = Boolean(wanixSystem?.isReady);
const terminalLayer = document.getElementById('terminal-layer');
const terminalSessions = new Map();
wanixSystem?.addEventListener('ready', (event) => {
  if (event.target !== wanixSystem) return;
  systemReady = true;
  for (const session of terminalSessions.values()) wakeTerminalSession(session);
});

function hideTerminalLayer() {
  terminalLayer?.classList.add('dragging');
}

document.addEventListener('dragstart', (event) => {
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}, true);

function hideTerminalLayerForTouch(event) {
  if (event.type === 'pointerdown' && event.pointerType !== 'touch') return;
  if (event.target.closest?.('[role="tab"]')) hideTerminalLayer();
}

// Pointer drag targets sit below the persistent terminal layer. Hide it before
// the long-press drag begins so Home can be dropped onto a terminal pane too.
document.addEventListener('pointerdown', hideTerminalLayerForTouch, true);
document.addEventListener('touchstart', hideTerminalLayerForTouch, true);

function restoreTerminalLayer() {
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

function createTerminalSession(id) {
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-session';

  const task = document.createElement('wanix-task');
  task.id = `repl-${id}`;
  task.setAttribute('cmd', loadConfig().cmd || DEFAULT_CMD);
  task.setAttribute('type', 'gojs');
  task.setAttribute('env', buildEnv());
  task.setAttribute('term', '');
  task.setAttribute('start', '');
  task.setAttribute('for', 'wanix-system');

  const winchBind = document.createElement('wanix-bind');
  winchBind.setAttribute('dst', 'winch');
  winchBind.setAttribute('src', '#task/self/term/winch');
  task.appendChild(winchBind);

  const term = document.createElement('wanix-term');
  term.setAttribute('raw', '');
  term.setAttribute('no-scrollbar', '');
  term.setAttribute('path', `#task/repl-${id}/term`);
  term.setAttribute('for', 'wanix-system');

  wrapper.append(task, term);
  terminalLayer?.appendChild(wrapper);

  const session = { id, wrapper, task, term, anchor: null, layout: null, started: false };
  terminalSessions.set(id, session);
  return session;
}

function getTerminalSession(id) {
  return terminalSessions.get(id) || createTerminalSession(id);
}

function destroyTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  terminalSessions.delete(id);
  session.anchor = null;
  session.wrapper.remove();
}

function wakeTerminalSession(session) {
  if (!systemReady || session.started) return;
  session.started = true;
  queueMicrotask(() => {
    session.task._awake?.();
    session.term._awake?.();
  });
}

function layoutTerminalSession(session, anchor, isVisible) {
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

function focusTerminalSession(session, anchor, api, deferred = true) {
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

function attachTerminalSession(id, anchor, api) {
  const session = getTerminalSession(id);
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
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutTerminalSession(session, null, false);
    }
  };
}

// --- Reveal.js ---
const revealStates = new WeakMap();
let slidesMarkdownPromise = null;

function loadSlidesMarkdown() {
  if (!slidesMarkdownPromise) {
    slidesMarkdownPromise = fetch('slides.md').then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load slides.md (${response.status})`);
      return response.text();
    });
  }
  return slidesMarkdownPromise;
}

function layoutReveal(homeContent) {
  revealStates.get(homeContent)?.deck?.layout();
}

async function prepareRevealSlides(homeContent) {
  const placeholder = homeContent.querySelector('[data-home-slides-markdown]');
  if (!placeholder) return;

  const stack = document.createElement('section');
  for (const source of (await loadSlidesMarkdown()).split(/^\s*--\s*$/m)) {
    const slide = document.createElement('section');
    slide.innerHTML = marked.parse(source);
    stack.appendChild(slide);
  }
  placeholder.replaceWith(stack);
}

function initReveal(homeContent, api) {
  const existing = revealStates.get(homeContent);
  if (existing) return existing;

  const state = { deck: null, destroyed: false };
  revealStates.set(homeContent, state);
  state.ready = (async () => {
    while (typeof Reveal === 'undefined') {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (state.destroyed) return;
    }
    await prepareRevealSlides(homeContent);
    if (state.destroyed) return;

    const el = homeContent.querySelector('.reveal');
    if (!el) return;
    state.deck = new Reveal(el, {
      hash: false,
      controls: true,
      progress: true,
      center: true,
      transition: 'slide',
      backgroundTransition: 'fade',
      keyboard: true,
      keyboardCondition: () => api.isActive &&
        !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName),
      overview: true,
      touch: true,
      // Reveal switches to its scroll reader below 435px by default. That
      // mode disables navigation controls, including the custom arrows.
      scrollActivationWidth: null,
    });
    await state.deck.initialize();
    if (state.destroyed) return;
    layoutReveal(homeContent);
  })().catch((error) => {
    if (!state.destroyed) reportHomeError('Reveal initialization failed', error);
  });
  return state;
}

function destroyReveal(homeContent) {
  const state = revealStates.get(homeContent);
  if (!state) return;
  state.destroyed = true;
  state.deck?.destroy();
  revealStates.delete(homeContent);
}

// --- Config form setup ---
function setupConfigForm(homeContent) {
  const cfg = loadConfig();
  const cmdEl = homeContent.querySelector('[data-config="cmd"]');
  const envEl = homeContent.querySelector('[data-config="env"]');
  const autoEl = homeContent.querySelector('[data-config="auto-open"]');
  if (!cmdEl) return;
  cmdEl.value = cfg.cmd;
  envEl.value = cfg.env;
  autoEl.checked = !!cfg.autoOpen;

  homeContent.querySelector('[data-config-action="save"]').addEventListener('click', () => {
    saveConfig({
      cmd: cmdEl.value.trim() || DEFAULT_CMD,
      env: envEl.value,
      autoOpen: autoEl.checked,
    });
    const s = homeContent.querySelector('[data-config="status"]');
    s.textContent = 'Saved!';
    s.style.color = '#3fb950';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  homeContent.querySelector('[data-config-action="reset"]').addEventListener('click', () => {
    localStorage.removeItem(CONFIG_KEY);
    const c = loadConfig();
    cmdEl.value = c.cmd;
    envEl.value = c.env;
    autoEl.checked = !!c.autoOpen;
    const s = homeContent.querySelector('[data-config="status"]');
    s.textContent = 'Reset to defaults.';
    s.style.color = '#8b949e';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });
}

function addTerminalPanel(api, group) {
  const id = ++terminalIdCounter;
  const panel = api.addPanel({
    id: `terminal-${id}`,
    component: 'terminal',
    params: { terminalId: id },
    title: `Term ${id}`,
    ...(group && { position: { referenceGroup: group } }),
  });
  panel.api.setActive();
}

let homeIdCounter = 0;

function addHomePanel(api, group) {
  const id = ++homeIdCounter;
  const panel = api.addPanel({
    id: `home-${id}`,
    component: 'home',
    params: { homeId: id },
    title: 'Home',
    ...(group && { position: { referenceGroup: group } }),
  });
  panel.api.setActive();
  return panel;
}

function whenWanixReady(callback) {
  if (systemReady) {
    callback();
    return;
  }

  const onReady = (event) => {
    if (event.target !== wanixSystem) return;
    wanixSystem.removeEventListener('ready', onReady);
    callback();
  };
  wanixSystem?.addEventListener('ready', onReady);
}

// ========== Components ==========

// Home panels each own a Reveal instance so they can be split and closed independently.
function HomePanel({ api }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const template = document.getElementById('home-template');
    const homeContent = template?.content.firstElementChild?.cloneNode(true);
    if (!wrapper || !homeContent) return;

    wrapper.appendChild(homeContent);
    const panelView = wrapper.closest('.dv-view');
    if (panelView) panelView.classList.add('home-view');
    // Reveal also emits a bubbling "ready" event. Keep it from waking wanix.
    const stopReadyEvent = (event) => event.stopPropagation();
    homeContent.addEventListener('ready', stopReadyEvent);
    const dismiss = homeContent.querySelector('.home-debug-dismiss');
    dismiss?.addEventListener('click', dismissHomeDebugErrors);
    setupConfigForm(homeContent);
    showHomeDebugErrors();
    initReveal(homeContent, api);
    const layout = () => requestAnimationFrame(() => layoutReveal(homeContent));
    const subscriptions = [
      api.onDidDimensionsChange(layout),
      api.onDidVisibilityChange((event) => { if (event.isVisible) layout(); }),
      api.onDidLocationChange(layout),
      api.onDidGroupChange(layout),
    ];
    layout();

    return () => {
      homeContent.removeEventListener('ready', stopReadyEvent);
      dismiss?.removeEventListener('click', dismissHomeDebugErrors);
      if (panelView) panelView.classList.remove('home-view');
      for (const subscription of subscriptions) subscription.dispose();
      destroyReveal(homeContent);
      homeContent.remove();
    };
  }, [api]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

// Terminal panel: creates wanix-task + wanix-term
function TerminalPanel({ api, params }) {
  const id = params.terminalId;
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    return attachTerminalSession(id, wrapper, api);
  }, [id]);

  return React.createElement('div', { ref: wrapperRef, className: 'panel-content' });
}

// Compact header action: tap creates a terminal, long-press opens extensions.
function AddTerminalButton({ containerApi, group }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const controlRef = useRef(null);
  const pressTimer = useRef(null);
  const longPress = useRef(false);

  useEffect(() => {
    const groupView = controlRef.current?.closest('.dv-groupview');
    groupView?.classList.add('panel-action-host');
    return () => groupView?.classList.remove('panel-action-host');
  }, []);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const openMenu = () => {
    clearPressTimer();
    longPress.current = true;
    setMenuOpen(true);
  };

  const startPress = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    longPress.current = false;
    pressTimer.current = setTimeout(openMenu, 450);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event) => {
      if (!controlRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu, true);
    return () => document.removeEventListener('pointerdown', closeMenu, true);
  }, [menuOpen]);

  const createTerminal = (event) => {
    if (longPress.current) {
      event.preventDefault();
      longPress.current = false;
      return;
    }
    addTerminalPanel(containerApi, group);
  };

  return React.createElement('div', { ref: controlRef, className: 'panel-actions' },
    React.createElement('button', {
      className: 'panel-action-button',
      type: 'button',
      title: 'Add',
      'aria-label': 'Add panel',
      'aria-haspopup': 'menu',
      'aria-expanded': menuOpen,
      onPointerDown: startPress,
      onPointerUp: clearPressTimer,
      onPointerCancel: clearPressTimer,
      onPointerLeave: clearPressTimer,
      onContextMenu: (event) => { event.preventDefault(); openMenu(); },
      onClick: createTerminal,
    }, '+'),
    menuOpen && React.createElement('div', { className: 'panel-action-menu', role: 'menu' },
      React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        onClick: () => { setMenuOpen(false); addTerminalPanel(containerApi, group); },
      }, 'New Term'),
      React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        onClick: () => { setMenuOpen(false); addHomePanel(containerApi, group); },
      }, 'Home'),
    ),
  );
}

// Main application
function App() {
  const onReady = useCallback((event) => {
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);

    // Add the initial Home panel first.
    const homePanel = addHomePanel(event.api);

    event.api.onDidRemovePanel((panel) => {
      const match = /^terminal-(\d+)$/.exec(panel.id);
      if (match) destroyTerminalSession(Number(match[1]));
    });

    // Auto-open only after wanix is ready so it follows the same path as new tabs.
    const cfg = loadConfig();
    if (cfg.autoOpen) {
      whenWanixReady(() => {
        addTerminalPanel(event.api);
        event.api.getPanel(homePanel.id)?.api.setActive();
      });
    }
  }, []);

  return React.createElement(DockviewReact, {
    className: 'dockview-theme-github-dark',
    onReady,
    components: {
      home: HomePanel,
      terminal: TerminalPanel,
    },
    rightHeaderActionsComponent: AddTerminalButton,
  });
}

// --- Mount React app ---
const rootEl = document.getElementById('app-root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(React.createElement(App));
}
