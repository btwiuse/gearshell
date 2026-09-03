// Home landing sections: stateless markup components for the home
// panel. Copy + data live in home-data.js; LandingPanel (home.js)
// composes these and wires the openPanel/openExternal/scrollToId
// callbacks. Each component stays under 50 lines.

import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Github, LayoutGrid, Zap } from "lucide-react";
import { localFirstChips } from "./home-data.js";
import htm from "htm";
import { ghosttyIdentity, mountTerminal, sameDocSession } from "../terminal-mount.mjs";

const html = htm.bind(React.createElement);

export function HomeNav({ scrollToId, GH }) {
  return html`
    <nav className="mkt-nav">
      <div className="mkt-nav-brand">
        <img src=${new URL("logo-banner-logo.png", import.meta.url).href} alt="GearShell"/>
        <span>GEARSHELL</span>
      </div>
      <div className="mkt-nav-links">
        <a
          href="#mkt-features"
          onClick=${(ev) => {
            ev.preventDefault();
            scrollToId("mkt-features");
          }}
        >Features</a>
        <a
          href="#mkt-how"
          onClick=${(ev) => {
            ev.preventDefault();
            scrollToId("mkt-how");
          }}
        >How it works</a>
        <a href=${GH} target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>
  `;
}

function HeroButtons({ openPanel, openExternal, scrollToId, GH }) {
  return html`
    <div className="mkt-cta">
      <button className="mkt-btn mkt-btn-primary" type="button" onClick=${() => openPanel("console")}>
        <${Zap} size=${16} aria-hidden=${true}/>
        <span>Open Terminal</span>
        <${ArrowRight} size=${14} aria-hidden=${true}/>
      </button>
      <button className="mkt-btn mkt-btn-ghost" type="button" onClick=${() => openPanel("launcher")}>
        <${LayoutGrid} size=${16} aria-hidden=${true}/>
        <span>Browse apps</span>
      </button>
      <button className="mkt-btn mkt-btn-ghost" type="button" onClick=${() => openExternal(GH)}>
        <${Github} size=${16} aria-hidden=${true}/>
        <span>GitHub</span>
      </button>
      <button className="mkt-btn mkt-btn-ghost" type="button" onClick=${() => scrollToId("mkt-how")}>
        <${BookOpen} size=${16} aria-hidden=${true}/>
        <span>How it works</span>
      </button>
    </div>
  `;
}

export function HomeHero({ openPanel, openExternal, scrollToId, GH }) {
  return html`
    <header className="mkt-hero">
      <div className="mkt-kicker">WEB NATIVE AGENT SANDBOX</div>
      <h1>A browser-native shell.</h1>
      <p className="mkt-hero-lede">A kernel. A shell. A terminal. A browser. A tiling workspace. Any AI agent.</p>
      <p className="mkt-hero-tag">All in one tab.</p>
      <p className="mkt-hero-sub">Zero install. Real Linux. Git, Docker, kubectl, esbuild, TypeScript, Go, Claude Code — all running in your browser, persistent across reloads, distributable as a URL.</p>
      <${HeroButtons} openPanel=${openPanel} openExternal=${openExternal} scrollToId=${scrollToId} GH=${GH}/>
    </header>
  `;
}

export function HomeFeatures({ features }) {
  return html`
    <section className="mkt-page mkt-section" id="mkt-features">
      <div className="mkt-section-label">FEATURES</div>
      <h2>A whole OS, in one tab.</h2>
      <p className="lead">No VMs to provision. No containers to pull. No installs to babysit. Just open a tab and get a real environment.</p>
      <div className="mkt-features">
        ${features.map((f, i) =>
          html`
            <div className="mkt-feature" key=${f.id}>
              <div className="mkt-feature-head">
                <span className="mkt-feature-idx">0${i + 1}</span>
                <${f.icon} size=${18} aria-hidden=${true}/>
                <span>${f.title}</span>
              </div>
              <p>${f.body}</p>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

const DEMO_SEGMENTS = [
  ["$ gear init my-app\n", null],
  ["  ✓ pulling linux userspace ", "mkt-muted"],
  ["(47 MB)\n", "mkt-dim"],
  ["  ✓ mounting vfs at ", "mkt-muted"],
  ["/home/gear\n", "mkt-prompt"],
  ["  ✓ ready in ", "mkt-muted"],
  ["312 ms\n\n", "mkt-ok"],
  ["$ cd my-app && git clone ", null],
  ["github.com/me/repo", "mkt-prompt"],
  ["\n", null],
  ["Cloning into 'repo'...\n", "mkt-muted"],
  ["✓ ", "mkt-ok"],
  ["done. 142 files, 3 branches.\n\n", "mkt-muted"],
  ["$ claude\n", null],
  ["> Hi, I am Claude Code. Working in ", "mkt-muted"],
  ["/home/gear/my-app/repo", "mkt-prompt"],
  [".\n", "mkt-muted"],
  ["> What would you like to build?\n", "mkt-muted"],
  ["$ ▌", null],
];

function DemoTerminal() {
  return html`
    <pre className="mkt-demo-body">
      ${DEMO_SEGMENTS.map(([text, cls], i) =>
        cls ? html`<span key=${i} className=${cls}>${text}</span>` : text,
      )}
    </pre>
  `;
}

// Terminal-frame-style title bar shown above both the static transcript and
// the live terminal. Only once the terminal is live do the restart and
// fullscreen actions appear (the static placeholder is the click target that
// opens the terminal, so it stays clean).
function DemoBar({ live, full, onRestart, onFullscreen }) {
  return html`
    <div className="mkt-demo-bar" data-live=${live ? "1" : "0"}>
      <span className="mkt-demo-dot mkt-demo-dot-red"></span>
      <span className="mkt-demo-dot mkt-demo-dot-yellow"></span>
      <span className="mkt-demo-dot mkt-demo-dot-green"></span>
      <span className="mkt-demo-title">gear@gear: ~</span>
      ${
        live
          ? html`
              <span className="mkt-demo-actions">
                <span className="mkt-demo-status"><span className="mkt-demo-status-dot"></span>session live</span>
                <button className="mkt-demo-btn" type="button" title="Restart terminal" aria-label="Restart terminal"
                  onClick=${(ev) => { ev.stopPropagation(); onRestart(); }}>↻</button>
                <button className="mkt-demo-btn" type="button" title=${full ? "Exit fullscreen" : "Fullscreen"}
                  aria-label=${full ? "Exit fullscreen" : "Fullscreen"}
                  onClick=${(ev) => { ev.stopPropagation(); onFullscreen(); }}>${full ? "⤡" : "⛶"}</button>
              </span>
            `
          : ""
      }
    </div>
  `;
}

// Poll for the shell's GearShell terminal API (exposed during boot wiring;
// the Home panel can mount before initWorkspaceApi runs). Returns the
// resolved terminal surface or null after 30s.
async function awaitTerminalApi() {
  let terminalApi = window.GearShell?.terminal;
  const deadline = Date.now() + 30000;
  while ((!terminalApi || typeof terminalApi.create !== "function") &&
         Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    terminalApi = window.GearShell?.terminal;
  }
  return terminalApi && typeof terminalApi.create === "function"
    ? terminalApi
    : null;
}

// Start a kernel terminal session in-flow on `anchor` and wire it through
// Render an OSC 9;4-style progress bar into `bar` (like terminal-frame's).
// The addon itself only exposes onChange; the bar is a thin element whose
// fill width reflects the reported progress.
function wireProgress(term, libs, bar) {
  if (!bar) return null;
  const addon = new libs.ProgressAddon();
  term.loadAddon(addon);
  const sub = addon.onChange((progress) => {
    const stateValue = progress && progress.state;
    const value = Math.max(0, Math.min(100, Number(progress && progress.value) || 0));
    bar.hidden = stateValue === 0 || stateValue == null;
    bar.dataset.state = String(stateValue == null ? 0 : stateValue);
    const fill = bar.firstElementChild;
    if (fill) fill.style.width = value + "%";
    if (stateValue === 3) fill?.removeAttribute("aria-valuenow");
  });
  return () => {
    sub?.dispose?.();
    addon?.dispose?.();
  };
}

// the shared mountTerminal helper (same transport adapters as the iframe
// plugins, but driving the same-document terminal API). `prog` is the
// progress bar element (optional). Returns a cleanup function that tears
// the session, xterm, observers, progress and listeners down.
async function openDemoTerminal(anchor, terminalApi, prog) {
  const handle = await mountTerminal(anchor, sameDocSession(terminalApi), {
    ...ghosttyIdentity({ terminal: {
      fontSize: 13,
      theme: { background: "#0a0e14", foreground: "#e6edf3", cursor: "#58a6ff" },
    } }),
    setupAddons: (term, libs) => {
      wireProgress(term, libs, prog);
    },
  });
  return () => {
    try {
      handle.dispose();
    } catch {}
  };
}

function LiveTerminal() {
  const hostRef = useRef(null);
  const progRef = useRef(null);
  useEffect(() => {
    let cleanup = null;
    awaitTerminalApi()
      .then((terminalApi) =>
        terminalApi && hostRef.current
          ? openDemoTerminal(hostRef.current, terminalApi, progRef.current)
          : null,
      )
      .then((fn) => {
        cleanup = fn;
      })
      .catch((error) => console.error("home demo terminal:", error));
    return () => cleanup?.();
  }, []);
  return html`
    <div className="mkt-demo-progress" ref=${progRef} hidden>
      <div className="mkt-demo-progress-fill"></div>
    </div>
    <div ref=${hostRef} className="mkt-demo-live"></div>
  `;
}

export function HomeDemo() {
  const [live, setLive] = useState(false);
  const [full, setFull] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const restart = () => setRestartKey((k) => k + 1);
  const fullscreen = () => setFull((f) => !f);
  return html`
    <section className="mkt-page mkt-section" id="mkt-demo">
      <div className="mkt-section-label">DEMO</div>
      <h2>Open a tab. Get a terminal.</h2>
      <p className="lead">Same shell. Same dotfiles. Same state. On a borrowed laptop, a coffee shop Wi-Fi, or a phone on a plane.</p>
      <div
        className=${"mkt-demo-frame" + (full ? " is-fullscreen" : "")}
        ...${live ? { "aria-label": "Live terminal" } : {}}
      >
        <${DemoBar} live=${live} full=${full} onRestart=${restart} onFullscreen=${fullscreen}/>
        ${
          live
            ? html`<${LiveTerminal} key=${restartKey}/>`
            : html`
                <button
                  className="mkt-demo-placeholder"
                  type="button"
                  aria-label="Open Terminal"
                  onClick=${() => setLive(true)}
                >
                  <${DemoTerminal}/>
                </button>
              `
        }
      </div>
      <p className="mkt-demo-caption">Real terminal, real Claude Code, zero installs.</p>
    </section>
  `;
}

function renderLocalFirstChips() {
  return html`
    <div className="mkt-chips">
      ${localFirstChips.map(([strong, rest], i) =>
        html`
          <div className="mkt-chip" key=${i}>
            <span className="mkt-chip-dot" aria-hidden=${true}></span>
            <span className="mkt-chip-strong">${strong}</span>
            <span className="mkt-chip-sep">,</span>
            <span>${rest}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function renderBonsaiLink() {
  return html`
    <div className="mkt-bonsai-link">
      <div className="mkt-bonsai-kicker">TRY THE LOCAL MODEL</div>
      <div className="mkt-bonsai-body">
        <strong>Bonsai 27B</strong>
        · 3.8 GB · WebGPU · no server.
      </div>
      <a
        className="mkt-bonsai-cta"
        href="https://huggingface.co/prism-ml/Bonsai-27B-gguf"
        target="_blank"
        rel="noopener"
      >Open Bonsai 27B →</a>
    </div>
  `;
}

export function HomeLocalFirst() {
  return html`
    <section className="mkt-page mkt-section" id="mkt-local">
      <div className="mkt-section-label">LOCAL-FIRST</div>
      <h2>Your data. Your model. Your machine.</h2>
      <p className="lead">Every byte stays on your device. Every model runs on your GPU. Every agent answers to you. The tab is your computer — and your computer does not phone home.</p>
      ${renderLocalFirstChips()}
      ${renderBonsaiLink()}
    </section>
  `;
}

export function HomeHow({ steps }) {
  return html`
    <section className="mkt-page mkt-section" id="mkt-how">
      <div className="mkt-section-label">HOW IT WORKS</div>
      <h2>Three layers. One tab.</h2>
      <p className="lead">No magic. Just WebAssembly, a virtual filesystem, and a browser-native UI.</p>
      <div className="mkt-steps">
        ${steps.map((s) =>
          html`
            <div className="mkt-step" key=${s.n}>
              <div className="mkt-step-n">${s.n}</div>
              <h3>${s.h}</h3>
              <p>${s.p}</p>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

export function HomeQuotes({ quotes }) {
  return html`
    <section className="mkt-page mkt-section" id="mkt-quotes">
      <div className="mkt-section-label">WHO IT’S FOR</div>
      <h2>Used by the people who’d rather not install things.</h2>
      <p className="lead">Solo devs, infra teams, and agent builders. All of them share one thing: a strong preference for tabs over terminals.</p>
      <div className="mkt-quotes">
        ${quotes.map((q) =>
          html`
            <figure className="mkt-step mkt-quote-figure" key=${q.initials}>
              <p>“${q.body}”</p>
              <figcaption className="mkt-quote-author">
                <span className="mkt-quote-avatar" aria-hidden=${true}>${q.initials}</span>
                <span>${q.author} · <span style=${{ color: "#8b949e" }}>${q.role}</span></span>
              </figcaption>
            </figure>
          `,
        )}
      </div>
    </section>
  `;
}

function FooterLinks({ scrollToId, GH }) {
  return html`
    <div className="mkt-foot-links">
      <a href=${GH} target="_blank" rel="noopener">GitHub</a>
      <a href="https://x.com/gear_sh" target="_blank" rel="noopener">X</a>
      <a href=${GH + "#readme"} target="_blank" rel="noopener">Docs</a>
      <a
        href="#mkt-features"
        onClick=${(ev) => {
          ev.preventDefault();
          scrollToId("mkt-features");
        }}
      >Features</a>
      <a
        href="#mkt-how"
        onClick=${(ev) => {
          ev.preventDefault();
          scrollToId("mkt-how");
        }}
      >How it works</a>
    </div>
  `;
}

export function HomeFooter({ openPanel, scrollToId, GH }) {
  return html`
    <footer className="mkt-page mkt-foot">
      <h2>Your machine is wherever you open a tab.</h2>
      <p>Free, open source, self-hostable.</p>
      <div className="mkt-cta" style=${{ justifyContent: "center" }}>
        <button className="mkt-btn mkt-btn-primary" type="button" onClick=${() => openPanel("console")}>
          <${Zap} size=${16} aria-hidden=${true}/>
          <span>Open Terminal</span>
          <${ArrowRight} size=${14} aria-hidden=${true}/>
        </button>
        <button className="mkt-btn mkt-btn-ghost" type="button" onClick=${() => openPanel("launcher")}>
          <${LayoutGrid} size=${16} aria-hidden=${true}/>
          <span>Browse apps</span>
        </button>
      </div>
      <${FooterLinks} scrollToId=${scrollToId} GH=${GH}/>
    </footer>
  `;
}
