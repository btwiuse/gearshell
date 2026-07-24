import React, { useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewReact } from 'dockview-react';

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

function restoreTerminalLayer() {
  terminalLayer?.classList.remove('dragging');
}

// Dockview consumes the bubbling end/drop events while completing a native tab
// drag. Listen in capture phase so the preview state cannot get stuck hidden.
document.addEventListener('dragend', restoreTerminalLayer, true);
document.addEventListener('drop', restoreTerminalLayer, true);
document.addEventListener('pointerup', restoreTerminalLayer, true);
document.addEventListener('pointercancel', restoreTerminalLayer, true);
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

  const session = { id, wrapper, task, term, anchor: null, started: false };
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
    return;
  }

  const bounds = anchor.getBoundingClientRect();
  const layerBounds = terminalLayer.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    session.wrapper.classList.remove('visible');
    return;
  }

  session.wrapper.style.left = `${bounds.left - layerBounds.left}px`;
  session.wrapper.style.top = `${bounds.top - layerBounds.top}px`;
  session.wrapper.style.width = `${bounds.width}px`;
  session.wrapper.style.height = `${bounds.height}px`;
  session.wrapper.classList.add('visible');
  requestAnimationFrame(() => {
    if (!session.wrapper.isConnected) return;
    session.term._fitAddon?.fit();
  });
}

function focusTerminalSession(session, anchor) {
  requestAnimationFrame(() => {
    if (session.anchor !== anchor || !session.wrapper.classList.contains('visible')) return;
    session.term._term?.focus();
  });
}

function attachTerminalSession(id, anchor, api) {
  const session = getTerminalSession(id);

  const update = () => {
    session.anchor = anchor;
    const bounds = anchor.getBoundingClientRect();
    const isVisible = anchor.isConnected && bounds.width > 0 && bounds.height > 0;
    layoutTerminalSession(session, anchor, isVisible);
    if (isVisible) {
      requestAnimationFrame(() => {
        const currentBounds = anchor.getBoundingClientRect();
        if (session.anchor === anchor && currentBounds.width > 0 && currentBounds.height > 0) {
          wakeTerminalSession(session);
        }
      });
    }
  };
  const observer = new ResizeObserver(update);
  observer.observe(anchor);
  const subscriptions = [
    api.onDidDimensionsChange(update),
    api.onDidActiveChange((event) => {
      update();
      if (event.isActive && api.isGroupActive) focusTerminalSession(session, anchor);
    }),
    api.onDidFocusChange((event) => {
      if (event.isFocused) focusTerminalSession(session, anchor);
    }),
    api.onDidVisibilityChange(update),
    api.onDidLocationChange(update),
    api.onDidGroupChange(update),
  ];

  update();
  if (api.isActive && api.isGroupActive) focusTerminalSession(session, anchor);

  return () => {
    observer.disconnect();
    for (const subscription of subscriptions) subscription.dispose();
    if (session.anchor === anchor) {
      session.anchor = null;
      layoutTerminalSession(session, null, false);
    }
  };
}

// --- Reveal.js ---
let deck = null;
let slideControlsInitialized = false;

function setupSlideControls() {
  if (slideControlsInitialized) return;
  const previous = document.getElementById('slide-prev');
  const next = document.getElementById('slide-next');
  if (!previous || !next) return;

  previous.addEventListener('click', () => deck?.prev());
  next.addEventListener('click', () => deck?.next());
  slideControlsInitialized = true;
}

function initReveal() {
  if (typeof Reveal === 'undefined') { requestAnimationFrame(initReveal); return; }
  const el = document.querySelector('#home-content .reveal');
  if (!el) { requestAnimationFrame(initReveal); return; }
  if (deck) {
    deck.layout();
    return;
  }
  deck = new Reveal(el, {
    hash: false,
    controls: false,
    progress: true,
    center: true,
    transition: 'slide',
    backgroundTransition: 'fade',
    keyboard: true,
    keyboardCondition: () => !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName),
    overview: true,
    touch: true,
    plugins: [ RevealMarkdown ],
  });
  Promise.resolve(deck.initialize()).then(setupSlideControls);
}

// --- Config form setup (once) ---
function setupConfigForm() {
  const cfg = loadConfig();
  const cmdEl = document.getElementById('cfg-cmd');
  const envEl = document.getElementById('cfg-env');
  const autoEl = document.getElementById('cfg-auto-open');
  if (!cmdEl) return;
  cmdEl.value = cfg.cmd;
  envEl.value = cfg.env;
  autoEl.checked = !!cfg.autoOpen;

  document.getElementById('cfg-save').addEventListener('click', () => {
    saveConfig({
      cmd: document.getElementById('cfg-cmd').value.trim() || DEFAULT_CMD,
      env: document.getElementById('cfg-env').value,
      autoOpen: document.getElementById('cfg-auto-open').checked,
    });
    const s = document.getElementById('cfg-status');
    s.textContent = 'Saved!';
    s.style.color = '#3fb950';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });

  document.getElementById('cfg-reset').addEventListener('click', () => {
    localStorage.removeItem(CONFIG_KEY);
    const c = loadConfig();
    cmdEl.value = c.cmd;
    envEl.value = c.env;
    autoEl.checked = !!c.autoOpen;
    const s = document.getElementById('cfg-status');
    s.textContent = 'Reset to defaults.';
    s.style.color = '#8b949e';
    setTimeout(() => { s.textContent = ''; }, 2000);
  });
}
window.addEventListener('DOMContentLoaded', setupConfigForm);

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

// Home panel: keeps the existing Reveal DOM in the dockview panel.
function HomePanel({ api }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const homeContent = document.getElementById('home-content');
    if (!wrapper || !homeContent) return;

    wrapper.appendChild(homeContent);
    // Reveal also emits a bubbling "ready" event. Keep it from waking wanix.
    const stopReadyEvent = (event) => event.stopPropagation();
    homeContent.addEventListener('ready', stopReadyEvent);
    homeContent.hidden = false;
    initReveal();
    const layout = () => requestAnimationFrame(() => deck?.layout());
    const subscriptions = [
      api.onDidDimensionsChange(layout),
      api.onDidVisibilityChange((event) => { if (event.isVisible) layout(); }),
      api.onDidLocationChange(layout),
      api.onDidGroupChange(layout),
    ];
    layout();

    return () => {
      homeContent.removeEventListener('ready', stopReadyEvent);
      for (const subscription of subscriptions) subscription.dispose();
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

// Add terminal button in dockview header
function AddTerminalButton({ containerApi, group }) {
  const addTerminal = () => {
    addTerminalPanel(containerApi, group);
  };

  return React.createElement('button', {
    onClick: addTerminal,
    title: 'New terminal',
    style: {
      background: 'transparent',
      border: 'none',
      color: '#8b949e',
      cursor: 'pointer',
      fontSize: '13px',
      padding: '0 12px',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
  }, '+', React.createElement('span', null, 'New Term'));
}

// Main application
function App() {
  const onReady = useCallback((event) => {
    // This covers both the HTML5 and Pointer Event drag backends used by Dockview.
    event.api.onWillShowOverlay(hideTerminalLayer);
    event.api.onDidDrop(restoreTerminalLayer);

    // Add home panel first (not closable)
    event.api.addPanel({
      id: 'home',
      component: 'home',
      params: {},
      title: 'Home',
    });

    event.api.onDidRemovePanel((panel) => {
      const match = /^terminal-(\d+)$/.exec(panel.id);
      if (match) destroyTerminalSession(Number(match[1]));
    });

    // Auto-open only after wanix is ready so it follows the same path as new tabs.
    const cfg = loadConfig();
    if (cfg.autoOpen) {
      whenWanixReady(() => {
        addTerminalPanel(event.api);
        event.api.getPanel('home')?.api.setActive();
      });
    }

    // Set home as the active panel
    const homePanel = event.api.getPanel('home');
    if (homePanel) homePanel.api.setActive();
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
