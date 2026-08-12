// Home: the marketing landing page shown by default.
//
// This module owns the `home` dockview panel end-to-end: hero, features,
// demo, local-first, how-it-works, customer quotes, X post cards, and
// footer CTA. Kept out of app.js so the main bundle stays focused on
// shell internals and the home page can be styled + iterated in
// isolation (see home.css).
//
// Dependency-injection shim: app.js calls `initHome(dependencies)` from
// the bottom of its module body, populating a small lookup table that
// the helpers below read lazily via `homeDep(name)`. Mirrors the same
// pattern as crush-runner.js so neither file has to know about the
// other's internals.

import React from "react";
import {
  Archive, ArrowRight, BookOpen, Cpu, Github, Layers, Zap,
} from 'lucide-react';

let __homeDeps = null;
export function initHome(dependencies) {
  __homeDeps = dependencies;
}
function homeDep(name) {
  if (__homeDeps == null) {
    throw new Error('home: initHome() has not been called; ensure app.js wires it in.');
  }
  const value = __homeDeps[name];
  if (value === undefined) {
    throw new Error(`home: missing dependency ${name}`);
  }
  return value;
}

// Counter for unique Home panel ids. The counter is module-scoped so it
// survives React re-renders but resets on page reload.
let homeIdCounter = 0;

function LandingPanel({ containerApi }) {
  const openPanel = (component) => {
    const api = containerApi || homeDep('getDockviewApi')();
    if (api) homeDep('addPanelByComponent')(api, component);
  };
  const openExternal = (url) => window.open(url, '_blank', 'noopener');
  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const features = [
    { id: 'kernel', icon: Cpu, title: 'A real kernel',
      body: 'Linux. Real syscalls. Real processes. Real filesystems. Real networking. Not a sandbox. Not an emulator. A kernel.' },
    { id: 'stack', icon: Layers, title: 'Your full stack',
      body: 'Node. Python. Go. Rust. Bash. Postgres. Redis. Whatever runs on your laptop runs here.' },
    { id: 'speed', icon: Zap, title: 'Sub-second cold starts',
      body: 'Open a repo. It is already running. No npm install for an hour. No Docker daemon. No warmup.' },
    { id: 'persistent', icon: Archive, title: 'Persistent by default',
      body: 'Close the tab. Open it next week. Open it on a plane. Files. Shell history. Branches. Dotfiles. State. Right where you left it.' },
  ];
  const steps = [
    { n: '01', h: 'WASM microkernel', p: 'A real operating environment compiled to WebAssembly. Linux syscalls, processes, networking — all running in your browser sandbox.' },
    { n: '02', h: 'Virtual filesystem', p: 'A writable VFS that survives reloads. Mount remote repos, import local folders, snapshot the entire workspace to a URL.' },
    { n: '03', h: 'Browser-native shell', p: 'xterm.js-driven PTY, tiling window manager, and a built-in browser. CLI agents like Claude Code or Crush run unmodified.' },
  ];
  const GH = 'https://github.com/gearshell/gearshell';
  const quotes = [
    { initials: 'LH', body: 'The browser is the new curl | sh. A URL is a binary now.', author: 'Lin H.', role: 'agent builder' },
    { initials: 'MR', body: 'I shipped a Claude Code session from a phone on a train. The state was exactly where I left it when I opened the same URL on my laptop two hours later.', author: 'Marta R.', role: 'solo dev' },
    { initials: 'DK', body: 'We embed a GearShell tab in our docs. Customers run the example in one click — no Docker, no npm install, no Slack message asking us why their node version is wrong.', author: 'Devin K.', role: 'infra lead, series A' },
  ];

  return React.createElement('div', { className: 'landing-panel panel-content' },
    React.createElement('div', { className: 'mkt-page' },
      // Nav
      React.createElement('nav', { className: 'mkt-nav' },
        React.createElement('div', { className: 'mkt-nav-brand' },
          React.createElement('img', { src: 'logo-banner-logo.png', alt: 'GearShell' }),
          React.createElement('span', null, 'GEARSHELL'),
        ),
        React.createElement('div', { className: 'mkt-nav-links' },
          React.createElement('a', { href: '#mkt-features', onClick: (ev) => { ev.preventDefault(); scrollToId('mkt-features'); } }, 'Features'),
          React.createElement('a', { href: '#mkt-how', onClick: (ev) => { ev.preventDefault(); scrollToId('mkt-how'); } }, 'How it works'),
          React.createElement('a', { href: GH, target: '_blank', rel: 'noopener' }, 'GitHub'),
        ),
      ),
      // Hero
      React.createElement('header', { className: 'mkt-hero' },
        React.createElement('div', { className: 'mkt-kicker' }, 'WEB NATIVE AGENT SANDBOX'),
        React.createElement('h1', null, 'A browser-native shell.'),
        React.createElement('p', { className: 'mkt-hero-lede' }, 'A kernel. A shell. A terminal. A browser. A tiling window manager. An AI assistant.'),
        React.createElement('p', { className: 'mkt-hero-tag' }, 'All in one tab.'),
        React.createElement('p', { className: 'mkt-hero-sub' },
          'Zero install. Real Linux. Git, Docker, kubectl, esbuild, TypeScript, Go, Claude Code — all running in your browser, persistent across reloads, distributable as a URL.',
        ),
        React.createElement('div', { className: 'mkt-cta' },
          React.createElement('button', { className: 'mkt-btn mkt-btn-primary', type: 'button', onClick: () => openPanel('terminal') },
            React.createElement(Zap, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'Open Terminal'),
            React.createElement(ArrowRight, { size: 14, 'aria-hidden': true }),
          ),
          React.createElement('button', { className: 'mkt-btn mkt-btn-ghost', type: 'button', onClick: () => openExternal(GH) },
            React.createElement(Github, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'GitHub'),
          ),
          React.createElement('button', { className: 'mkt-btn mkt-btn-ghost', type: 'button', onClick: () => scrollToId('mkt-how') },
            React.createElement(BookOpen, { size: 16, 'aria-hidden': true }),
            React.createElement('span', null, 'How it works'),
          ),
        ),
      ),
    ),
    // Features
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-features' },
      React.createElement('div', { className: 'mkt-section-label' }, 'FEATURES'),
      React.createElement('h2', null, 'A whole OS, in one tab.'),
      React.createElement('p', { className: 'lead' }, 'No VMs to provision. No containers to pull. No installs to babysit. Just open a tab and get a real environment.'),
      React.createElement('div', { className: 'mkt-features' },
        ...features.map((f, i) =>
          React.createElement('div', { className: 'mkt-feature', key: f.id },
            React.createElement('div', { className: 'mkt-feature-head' },
              React.createElement('span', { className: 'mkt-feature-idx' }, `0${i + 1}`),
              React.createElement(f.icon, { size: 18, 'aria-hidden': true }),
              React.createElement('span', null, f.title),
            ),
            React.createElement('p', null, f.body),
          ),
        ),
      ),
    ),
    // Demo
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-demo' },
      React.createElement('div', { className: 'mkt-section-label' }, 'DEMO'),
      React.createElement('h2', null, 'Open a tab. Get a terminal.'),
      React.createElement('p', { className: 'lead' }, 'Same shell. Same dotfiles. Same state. On a borrowed laptop, a coffee shop Wi-Fi, or a phone on a plane.'),
      React.createElement('button', { className: 'mkt-demo-frame', type: 'button', 'aria-label': 'Open Terminal', onClick: () => openPanel('terminal') },
        React.createElement('div', { className: 'mkt-demo-bar' },
          React.createElement('span', { className: 'mkt-demo-dot' }),
          React.createElement('span', { className: 'mkt-demo-dot' }),
          React.createElement('span', { className: 'mkt-demo-dot' }),
          React.createElement('span', { className: 'mkt-demo-title' }, 'gear@gear: ~'),
        ),
        React.createElement('pre', { className: 'mkt-demo-body' },
          '$ gear init my-app\n',
          React.createElement('span', { className: 'mkt-muted' }, '  ✓ pulling linux userspace '),
          React.createElement('span', { className: 'mkt-dim' }, '(47 MB)\n'),
          React.createElement('span', { className: 'mkt-muted' }, '  ✓ mounting vfs at '),
          React.createElement('span', { className: 'mkt-prompt' }, '/home/gear\n'),
          React.createElement('span', { className: 'mkt-muted' }, '  ✓ ready in '),
          React.createElement('span', { className: 'mkt-ok' }, '312 ms\n\n'),
          '$ cd my-app && git clone ',
          React.createElement('span', { className: 'mkt-prompt' }, 'github.com/me/repo'),
          '\n',
          React.createElement('span', { className: 'mkt-muted' }, "Cloning into 'repo'...\n"),
          React.createElement('span', { className: 'mkt-ok' }, '✓ '),
          React.createElement('span', { className: 'mkt-muted' }, 'done. 142 files, 3 branches.\n\n'),
          '$ claude\n',
          React.createElement('span', { className: 'mkt-muted' }, '> Hi, I am Claude Code. Working in '),
          React.createElement('span', { className: 'mkt-prompt' }, '/home/gear/my-app/repo'),
          React.createElement('span', { className: 'mkt-muted' }, '.\n'),
          React.createElement('span', { className: 'mkt-muted' }, '> What would you like to build?\n'),
          '$ ▌',
        ),
      ),
      React.createElement('p', { className: 'mkt-demo-caption' }, 'Real terminal, real Claude Code, zero installs.'),
    ),
    // Local-first
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-local' },
      React.createElement('div', { className: 'mkt-section-label' }, 'LOCAL-FIRST'),
      React.createElement('h2', null, 'Your data. Your model. Your machine.'),
      React.createElement('p', { className: 'lead' },
        'Every byte stays on your device. Every model runs on your GPU. Every agent answers to you. The tab is your computer — and your computer does not phone home.',
      ),
      React.createElement('div', { className: 'mkt-chips' },
        React.createElement('div', { className: 'mkt-chip' },
          React.createElement('span', { className: 'mkt-chip-dot', 'aria-hidden': true }),
          React.createElement('span', { className: 'mkt-chip-strong' }, 'Your code'),
          React.createElement('span', { className: 'mkt-chip-sep' }, ','),
          React.createElement('span', null, ' your cache'),
        ),
        React.createElement('div', { className: 'mkt-chip' },
          React.createElement('span', { className: 'mkt-chip-dot', 'aria-hidden': true }),
          React.createElement('span', { className: 'mkt-chip-strong' }, 'Your model'),
          React.createElement('span', { className: 'mkt-chip-sep' }, ','),
          React.createElement('span', null, ' your GPU'),
        ),
        React.createElement('div', { className: 'mkt-chip' },
          React.createElement('span', { className: 'mkt-chip-dot', 'aria-hidden': true }),
          React.createElement('span', { className: 'mkt-chip-strong' }, 'Your files'),
          React.createElement('span', { className: 'mkt-chip-sep' }, ','),
          React.createElement('span', null, ' your disk'),
        ),
        React.createElement('div', { className: 'mkt-chip' },
          React.createElement('span', { className: 'mkt-chip-dot', 'aria-hidden': true }),
          React.createElement('span', { className: 'mkt-chip-strong' }, 'Your agent'),
          React.createElement('span', { className: 'mkt-chip-sep' }, ','),
          React.createElement('span', null, ' your rules'),
        ),
      ),
      React.createElement('div', { className: 'mkt-bonsai-link' },
        React.createElement('div', { className: 'mkt-bonsai-kicker' }, 'TRY THE LOCAL MODEL'),
        React.createElement('div', { className: 'mkt-bonsai-body' },
          React.createElement('strong', null, 'Bonsai 27B'),
          ' · 3.8 GB · WebGPU · no server.',
        ),
        React.createElement('a', {
          className: 'mkt-bonsai-cta',
          href: 'https://huggingface.co/prism-ml/Bonsai-27B-gguf',
          target: '_blank',
          rel: 'noopener',
        }, 'Open Bonsai 27B →'),
      ),
    ),
    // How it works
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-how' },
      React.createElement('div', { className: 'mkt-section-label' }, 'HOW IT WORKS'),
      React.createElement('h2', null, 'Three layers. One tab.'),
      React.createElement('p', { className: 'lead' }, 'No magic. Just WebAssembly, a virtual filesystem, and a browser-native UI.'),
      React.createElement('div', { className: 'mkt-steps' },
        ...steps.map((s) =>
          React.createElement('div', { className: 'mkt-step', key: s.n },
            React.createElement('div', { className: 'mkt-step-n' }, s.n),
            React.createElement('h3', null, s.h),
            React.createElement('p', null, s.p),
          ),
        ),
      ),
    ),
    // Quotes
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-quotes' },
      React.createElement('div', { className: 'mkt-section-label' }, 'WHO IT’S FOR'),
      React.createElement('h2', null, 'Used by the people who’d rather not install things.'),
      React.createElement('p', { className: 'lead' }, 'Solo devs, infra teams, and agent builders. All of them share one thing: a strong preference for tabs over terminals.'),
      React.createElement('div', { className: 'mkt-quotes' },
        ...quotes.map((q) =>
          React.createElement('figure', { className: 'mkt-step mkt-quote-figure', key: q.initials },
            React.createElement('p', null, '“', q.body, '”'),
            React.createElement('figcaption', { className: 'mkt-quote-author' },
              React.createElement('span', { className: 'mkt-quote-avatar', 'aria-hidden': true }, q.initials),
              React.createElement('span', null, q.author, ' · ', React.createElement('span', { style: { color: '#8b949e' } }, q.role)),
            ),
          ),
        ),
      ),
    ),
    // X card: Zachary complaint
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-gap' },
      React.createElement('div', { className: 'mkt-section-label' }, 'THE GAP'),
      React.createElement('h2', null, 'Another agent. Another uninstall.'),
      React.createElement('p', { className: 'lead' }, 'The market knows it. Here is one of the louder complaints we have been hearing:'),
      React.createElement('article', { className: 'mkt-x-card' },
        React.createElement('header', { className: 'mkt-x-head' },
          React.createElement('span', { className: 'mkt-x-avatar', 'aria-hidden': true }, 'ZH'),
          React.createElement('div', { className: 'mkt-x-meta' },
            React.createElement('div', { className: 'mkt-x-name' },
              React.createElement('strong', null, 'Zachary_haha'),
            ),
            React.createElement('div', { className: 'mkt-x-handle' }, '@Zachary_haha'),
          ),
          React.createElement('a', { className: 'mkt-x-link', href: 'https://x.com/Zachary_haha/status/2084644286042198287', target: '_blank', rel: 'noopener', 'aria-label': 'Open original post on X' }, '↗'),
        ),
        React.createElement('p', { className: 'mkt-x-body' }, '好久都没看到什么新的有意思的产品了，天天看到的就是，又有一堆人出了一个Agent，然后用一下发现一坨屎，卸载，然后另一堆人出了另一个Agent，用一下发现又是一坨屎，在卸载。然后在电脑里拉的.xxxx文件夹的还得手动清理。。。真就没啥让人耳目一新的玩意儿。。。。'),
      ),
    ),
    // X card: David Cramer poll + Jeff Lindsay reply
    React.createElement('section', { className: 'mkt-page mkt-section', id: 'mkt-x' },
      React.createElement('div', { className: 'mkt-section-label' }, 'VOICE FROM THE FIELD'),
      React.createElement('h2', null, '“My answer is in the browser.”'),
      React.createElement('p', { className: 'lead' }, 'When 2,100 agent builders were asked where they host their agents, Jeff Lindsay replied to the thread with this:'),
      React.createElement('article', { className: 'mkt-x-card' },
        // Parent tweet (context)
        React.createElement('header', { className: 'mkt-x-head' },
          React.createElement('span', { className: 'mkt-x-avatar', 'aria-hidden': true }, 'DL'),
          React.createElement('div', { className: 'mkt-x-meta' },
            React.createElement('div', { className: 'mkt-x-name' },
              React.createElement('strong', null, 'David Cramer'),
              React.createElement('span', { className: 'mkt-x-check', 'aria-label': 'verified', title: 'verified' }, '✓'),
            ),
            React.createElement('div', { className: 'mkt-x-handle' }, '@zeeg · Jun 27, 2026'),
          ),
          React.createElement('a', { className: 'mkt-x-link', href: 'https://x.com/zeeg/status/2070591092471558567', target: '_blank', rel: 'noopener', 'aria-label': 'Open original post on X' }, '↗'),
        ),
        React.createElement('p', { className: 'mkt-x-body' }, 'If you’re building agents, either for internal tools or as part of your product, where are you hosting them?'),
        React.createElement('div', { className: 'mkt-x-poll', 'aria-label': 'Poll results' },
          React.createElement('div', { className: 'mkt-x-poll-row' },
            React.createElement('span', { className: 'mkt-x-poll-label' }, 'Cloudflare'),
            React.createElement('span', { className: 'mkt-x-poll-bar-wrap' },
              React.createElement('span', { className: 'mkt-x-poll-bar', style: { width: '43.6%' } }),
            ),
            React.createElement('span', { className: 'mkt-x-poll-pct' }, '43.6%'),
          ),
          React.createElement('div', { className: 'mkt-x-poll-row' },
            React.createElement('span', { className: 'mkt-x-poll-label' }, 'AWS / GCP / Azure'),
            React.createElement('span', { className: 'mkt-x-poll-bar-wrap' },
              React.createElement('span', { className: 'mkt-x-poll-bar', style: { width: '24.7%' } }),
            ),
            React.createElement('span', { className: 'mkt-x-poll-pct' }, '24.7%'),
          ),
          React.createElement('div', { className: 'mkt-x-poll-row' },
            React.createElement('span', { className: 'mkt-x-poll-label' }, 'Vercel'),
            React.createElement('span', { className: 'mkt-x-poll-bar-wrap' },
              React.createElement('span', { className: 'mkt-x-poll-bar', style: { width: '11.2%' } }),
            ),
            React.createElement('span', { className: 'mkt-x-poll-pct' }, '11.2%'),
          ),
          React.createElement('div', { className: 'mkt-x-poll-row' },
            React.createElement('span', { className: 'mkt-x-poll-label' }, 'Other'),
            React.createElement('span', { className: 'mkt-x-poll-bar-wrap' },
              React.createElement('span', { className: 'mkt-x-poll-bar', style: { width: '20.5%' } }),
            ),
            React.createElement('span', { className: 'mkt-x-poll-pct' }, '20.5%'),
          ),
          React.createElement('div', { className: 'mkt-x-poll-foot' }, '2,101 votes · Final results'),
        ),
        // Reply (Jeff)
        React.createElement('div', { className: 'mkt-x-reply' },
          React.createElement('span', { className: 'mkt-x-thread-line', 'aria-hidden': true }),
          React.createElement('div', { className: 'mkt-x-reply-inner' },
            React.createElement('header', { className: 'mkt-x-head' },
              React.createElement('span', { className: 'mkt-x-avatar', 'aria-hidden': true }, 'JL'),
              React.createElement('div', { className: 'mkt-x-meta' },
                React.createElement('div', { className: 'mkt-x-name' },
                  React.createElement('strong', null, 'Jeff Lindsay'),
                ),
                React.createElement('div', { className: 'mkt-x-handle' }, '@progrium · 6:43 AM · Jun 27, 2026'),
              ),
              React.createElement('a', { className: 'mkt-x-link', href: 'https://x.com/progrium/status/2070639004761145654', target: '_blank', rel: 'noopener', 'aria-label': 'Open reply on X' }, '↗'),
            ),
            React.createElement('p', { className: 'mkt-x-body mkt-x-body-reply' }, 'i dont know what this means but im pretty sure my answer is in the browser'),
            React.createElement('div', { className: 'mkt-x-stats' }, '1,236 views'),
          ),
        ),
      ),
    ),
    // Footer
    React.createElement('footer', { className: 'mkt-page mkt-foot' },
      React.createElement('h2', null, 'Your machine is wherever you open a tab.'),
      React.createElement('p', null, 'Free, open source, self-hostable.'),
      React.createElement('div', { className: 'mkt-cta', style: { justifyContent: 'center' } },
        React.createElement('button', { className: 'mkt-btn mkt-btn-primary', type: 'button', onClick: () => openPanel('terminal') },
          React.createElement(Zap, { size: 16, 'aria-hidden': true }),
          React.createElement('span', null, 'Open Terminal'),
          React.createElement(ArrowRight, { size: 14, 'aria-hidden': true }),
        ),
      ),
      React.createElement('div', { className: 'mkt-foot-links' },
        React.createElement('a', { href: GH, target: '_blank', rel: 'noopener' }, 'GitHub'),
        React.createElement('a', { href: 'https://x.com/gear_sh', target: '_blank', rel: 'noopener' }, 'X'),
        React.createElement('a', { href: GH + '#readme', target: '_blank', rel: 'noopener' }, 'Docs'),
        React.createElement('a', { href: '#mkt-features', onClick: (ev) => { ev.preventDefault(); scrollToId('mkt-features'); } }, 'Features'),
        React.createElement('a', { href: '#mkt-how', onClick: (ev) => { ev.preventDefault(); scrollToId('mkt-how'); } }, 'How it works'),
      ),
    ),
  );
}


// Register a new Home panel with dockview. Called from app.js's
// `addPanelByComponent` when the user picks Home from the panel menu,
// from the restore-saved-panels path on boot, and from the auto-start
// of `home` panels configured in `cfg.startupPanels`.
export function addLandingPanel(api, group) {
  const id = ++homeIdCounter;
  const panel = api.addPanel({
    id: `home-${id}`,
    component: 'home',
    params: { homeId: id, panelType: 'home' },
    title: 'Home',
    ...(group && { position: { referenceGroup: group } }),
  });
  const rememberOpenPanel = homeDep('rememberOpenPanel');
  rememberOpenPanel(panel, { component: 'home' });
  panel.api.setActive();
  return panel;
}

export { LandingPanel };
