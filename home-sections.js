// Home landing sections: stateless markup components for the home
// panel. Copy + data live in home-data.js; LandingPanel (home.js)
// composes these and wires the openPanel/openExternal/scrollToId
// callbacks. Each component stays under 50 lines.

import React from "react";
import { ArrowRight, BookOpen, Github, Zap } from "lucide-react";
import { localFirstChips } from "./home-data.js?v=20260828.1";

export function HomeNav({ scrollToId, GH }) {
  return React.createElement(
    "nav",
    { className: "mkt-nav" },
    React.createElement(
      "div",
      { className: "mkt-nav-brand" },
      React.createElement("img", {
        src: "logo-banner-logo.png",
        alt: "GearShell",
      }),
      React.createElement("span", null, "GEARSHELL"),
    ),
    React.createElement(
      "div",
      { className: "mkt-nav-links" },
      React.createElement("a", {
        href: "#mkt-features",
        onClick: (ev) => {
          ev.preventDefault();
          scrollToId("mkt-features");
        },
      }, "Features"),
      React.createElement("a", {
        href: "#mkt-how",
        onClick: (ev) => {
          ev.preventDefault();
          scrollToId("mkt-how");
        },
      }, "How it works"),
      React.createElement("a", {
        href: GH,
        target: "_blank",
        rel: "noopener",
      }, "GitHub"),
    ),
  );
}

function HeroButtons({ openPanel, openExternal, scrollToId, GH }) {
  return React.createElement(
    "div",
    { className: "mkt-cta" },
    React.createElement(
      "button",
      {
        className: "mkt-btn mkt-btn-primary",
        type: "button",
        onClick: () => openPanel("terminal"),
      },
      React.createElement(Zap, { size: 16, "aria-hidden": true }),
      React.createElement("span", null, "Open Terminal"),
      React.createElement(ArrowRight, { size: 14, "aria-hidden": true }),
    ),
    React.createElement(
      "button",
      {
        className: "mkt-btn mkt-btn-ghost",
        type: "button",
        onClick: () => openExternal(GH),
      },
      React.createElement(Github, { size: 16, "aria-hidden": true }),
      React.createElement("span", null, "GitHub"),
    ),
    React.createElement(
      "button",
      {
        className: "mkt-btn mkt-btn-ghost",
        type: "button",
        onClick: () => scrollToId("mkt-how"),
      },
      React.createElement(BookOpen, { size: 16, "aria-hidden": true }),
      React.createElement("span", null, "How it works"),
    ),
  );
}

export function HomeHero({ openPanel, openExternal, scrollToId, GH }) {
  return React.createElement(
    "header",
    { className: "mkt-hero" },
    React.createElement(
      "div",
      { className: "mkt-kicker" },
      "WEB NATIVE AGENT SANDBOX",
    ),
    React.createElement("h1", null, "A browser-native shell."),
    React.createElement(
      "p",
      { className: "mkt-hero-lede" },
      "A kernel. A shell. A terminal. A browser. A tiling window manager. An AI assistant.",
    ),
    React.createElement(
      "p",
      { className: "mkt-hero-tag" },
      "All in one tab.",
    ),
    React.createElement(
      "p",
      { className: "mkt-hero-sub" },
      "Zero install. Real Linux. Git, Docker, kubectl, esbuild, TypeScript, Go, Claude Code — all running in your browser, persistent across reloads, distributable as a URL.",
    ),
    React.createElement(HeroButtons, {
      openPanel,
      openExternal,
      scrollToId,
      GH,
    }),
  );
}

export function HomeFeatures({ features }) {
  return React.createElement(
    "section",
    { className: "mkt-page mkt-section", id: "mkt-features" },
    React.createElement("div", { className: "mkt-section-label" }, "FEATURES"),
    React.createElement("h2", null, "A whole OS, in one tab."),
    React.createElement(
      "p",
      { className: "lead" },
      "No VMs to provision. No containers to pull. No installs to babysit. Just open a tab and get a real environment.",
    ),
    React.createElement(
      "div",
      { className: "mkt-features" },
      ...features.map((f, i) =>
        React.createElement(
          "div",
          { className: "mkt-feature", key: f.id },
          React.createElement(
            "div",
            { className: "mkt-feature-head" },
            React.createElement(
              "span",
              { className: "mkt-feature-idx" },
              `0${i + 1}`,
            ),
            React.createElement(f.icon, { size: 18, "aria-hidden": true }),
            React.createElement("span", null, f.title),
          ),
          React.createElement("p", null, f.body),
        )
      ),
    ),
  );
}

function DemoTerminal() {
  return React.createElement(
    "pre",
    { className: "mkt-demo-body" },
    "$ gear init my-app\n",
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "  ✓ pulling linux userspace ",
    ),
    React.createElement("span", { className: "mkt-dim" }, "(47 MB)\n"),
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "  ✓ mounting vfs at ",
    ),
    React.createElement("span", { className: "mkt-prompt" }, "/home/gear\n"),
    React.createElement("span", { className: "mkt-muted" }, "  ✓ ready in "),
    React.createElement("span", { className: "mkt-ok" }, "312 ms\n\n"),
    "$ cd my-app && git clone ",
    React.createElement(
      "span",
      { className: "mkt-prompt" },
      "github.com/me/repo",
    ),
    "\n",
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "Cloning into 'repo'...\n",
    ),
    React.createElement("span", { className: "mkt-ok" }, "✓ "),
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "done. 142 files, 3 branches.\n\n",
    ),
    "$ claude\n",
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "> Hi, I am Claude Code. Working in ",
    ),
    React.createElement(
      "span",
      { className: "mkt-prompt" },
      "/home/gear/my-app/repo",
    ),
    React.createElement("span", { className: "mkt-muted" }, ".\n"),
    React.createElement(
      "span",
      { className: "mkt-muted" },
      "> What would you like to build?\n",
    ),
    "$ ▌",
  );
}

export function HomeDemo({ openPanel }) {
  return React.createElement(
    "section",
    { className: "mkt-page mkt-section", id: "mkt-demo" },
    React.createElement("div", { className: "mkt-section-label" }, "DEMO"),
    React.createElement("h2", null, "Open a tab. Get a terminal."),
    React.createElement(
      "p",
      { className: "lead" },
      "Same shell. Same dotfiles. Same state. On a borrowed laptop, a coffee shop Wi-Fi, or a phone on a plane.",
    ),
    React.createElement(
      "button",
      {
        className: "mkt-demo-frame",
        type: "button",
        "aria-label": "Open Terminal",
        onClick: () => openPanel("terminal"),
      },
      React.createElement(
        "div",
        { className: "mkt-demo-bar" },
        React.createElement("span", { className: "mkt-demo-dot" }),
        React.createElement("span", { className: "mkt-demo-dot" }),
        React.createElement("span", { className: "mkt-demo-dot" }),
        React.createElement(
          "span",
          { className: "mkt-demo-title" },
          "gear@gear: ~",
        ),
      ),
      React.createElement(DemoTerminal),
    ),
    React.createElement(
      "p",
      { className: "mkt-demo-caption" },
      "Real terminal, real Claude Code, zero installs.",
    ),
  );
}

export function HomeLocalFirst() {
  return React.createElement(
    "section",
    { className: "mkt-page mkt-section", id: "mkt-local" },
    React.createElement(
      "div",
      { className: "mkt-section-label" },
      "LOCAL-FIRST",
    ),
    React.createElement("h2", null, "Your data. Your model. Your machine."),
    React.createElement(
      "p",
      { className: "lead" },
      "Every byte stays on your device. Every model runs on your GPU. Every agent answers to you. The tab is your computer — and your computer does not phone home.",
    ),
    React.createElement(
      "div",
      { className: "mkt-chips" },
      ...localFirstChips.map(([strong, rest], i) =>
        React.createElement(
          "div",
          { className: "mkt-chip", key: i },
          React.createElement("span", {
            className: "mkt-chip-dot",
            "aria-hidden": true,
          }),
          React.createElement("span", { className: "mkt-chip-strong" }, strong),
          React.createElement("span", { className: "mkt-chip-sep" }, ","),
          React.createElement("span", null, rest),
        )
      ),
    ),
    React.createElement(
      "div",
      { className: "mkt-bonsai-link" },
      React.createElement(
        "div",
        { className: "mkt-bonsai-kicker" },
        "TRY THE LOCAL MODEL",
      ),
      React.createElement(
        "div",
        { className: "mkt-bonsai-body" },
        React.createElement("strong", null, "Bonsai 27B"),
        " · 3.8 GB · WebGPU · no server.",
      ),
      React.createElement("a", {
        className: "mkt-bonsai-cta",
        href: "https://huggingface.co/prism-ml/Bonsai-27B-gguf",
        target: "_blank",
        rel: "noopener",
      }, "Open Bonsai 27B →"),
    ),
  );
}

export function HomeHow({ steps }) {
  return React.createElement(
    "section",
    { className: "mkt-page mkt-section", id: "mkt-how" },
    React.createElement(
      "div",
      { className: "mkt-section-label" },
      "HOW IT WORKS",
    ),
    React.createElement("h2", null, "Three layers. One tab."),
    React.createElement(
      "p",
      { className: "lead" },
      "No magic. Just WebAssembly, a virtual filesystem, and a browser-native UI.",
    ),
    React.createElement(
      "div",
      { className: "mkt-steps" },
      ...steps.map((s) =>
        React.createElement(
          "div",
          { className: "mkt-step", key: s.n },
          React.createElement("div", { className: "mkt-step-n" }, s.n),
          React.createElement("h3", null, s.h),
          React.createElement("p", null, s.p),
        )
      ),
    ),
  );
}

export function HomeQuotes({ quotes }) {
  return React.createElement(
    "section",
    { className: "mkt-page mkt-section", id: "mkt-quotes" },
    React.createElement(
      "div",
      { className: "mkt-section-label" },
      "WHO IT’S FOR",
    ),
    React.createElement(
      "h2",
      null,
      "Used by the people who’d rather not install things.",
    ),
    React.createElement(
      "p",
      { className: "lead" },
      "Solo devs, infra teams, and agent builders. All of them share one thing: a strong preference for tabs over terminals.",
    ),
    React.createElement(
      "div",
      { className: "mkt-quotes" },
      ...quotes.map((q) =>
        React.createElement(
          "figure",
          { className: "mkt-step mkt-quote-figure", key: q.initials },
          React.createElement("p", null, "“", q.body, "”"),
          React.createElement(
            "figcaption",
            { className: "mkt-quote-author" },
            React.createElement("span", {
              className: "mkt-quote-avatar",
              "aria-hidden": true,
            }, q.initials),
            React.createElement(
              "span",
              null,
              q.author,
              " · ",
              React.createElement(
                "span",
                { style: { color: "#8b949e" } },
                q.role,
              ),
            ),
          ),
        )
      ),
    ),
  );
}

function FooterLinks({ scrollToId, GH }) {
  return React.createElement(
    "div",
    { className: "mkt-foot-links" },
    React.createElement("a", {
      href: GH,
      target: "_blank",
      rel: "noopener",
    }, "GitHub"),
    React.createElement("a", {
      href: "https://x.com/gear_sh",
      target: "_blank",
      rel: "noopener",
    }, "X"),
    React.createElement("a", {
      href: GH + "#readme",
      target: "_blank",
      rel: "noopener",
    }, "Docs"),
    React.createElement("a", {
      href: "#mkt-features",
      onClick: (ev) => {
        ev.preventDefault();
        scrollToId("mkt-features");
      },
    }, "Features"),
    React.createElement("a", {
      href: "#mkt-how",
      onClick: (ev) => {
        ev.preventDefault();
        scrollToId("mkt-how");
      },
    }, "How it works"),
  );
}

export function HomeFooter({ openPanel, scrollToId, GH }) {
  return React.createElement(
    "footer",
    { className: "mkt-page mkt-foot" },
    React.createElement("h2", null, "Your machine is wherever you open a tab."),
    React.createElement("p", null, "Free, open source, self-hostable."),
    React.createElement(
      "div",
      { className: "mkt-cta", style: { justifyContent: "center" } },
      React.createElement(
        "button",
        {
          className: "mkt-btn mkt-btn-primary",
          type: "button",
          onClick: () => openPanel("terminal"),
        },
        React.createElement(Zap, { size: 16, "aria-hidden": true }),
        React.createElement("span", null, "Open Terminal"),
        React.createElement(ArrowRight, { size: 14, "aria-hidden": true }),
      ),
    ),
    React.createElement(FooterLinks, { scrollToId, GH }),
  );
}
