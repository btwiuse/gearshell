#!/usr/bin/env node
// scripts/gen-app-store-previews.mjs — generate 1:1 preview images for
// every App Store plugin via `mmx image generate`. Run from repo root:
//   node scripts/gen-app-store-previews.mjs
// Re-running overwrites the existing PNGs (the App Store UI just shows
// whatever file exists on disk for a given plugin id, no caching).
//
// Every prompt follows the same visual recipe so the cards look like a
// unified set: a stylized UI snapshot on a deep navy gradient with a
// soft accent glow, framed by the plugin's own icon glyph. Only the
// surface content (terminal text, music waveform, file tree, etc.)
// changes per plugin.

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OUT = resolve(REPO, "plugin/app-store/previews");
mkdirSync(OUT, { recursive: true });

// Common visual style prefix. The compositing rules at the end keep the
// cards consistent: square framing, soft glow, dark backdrop, single
// accent color that varies per plugin.
const STYLE = [
  "Square 1:1 dark app preview card",
  "deep navy gradient background (#0d1117 → #161b22)",
  "soft cyan-purple accent glow on the edges",
  "subtle grid texture, slightly blurred",
  "rounded inner panel with a faint border",
  "centered stylized UI mockup, no text labels",
  "cinematic, high contrast, soft volumetric light",
  "no human figures, no logos",
  "no border watermarks",
].join(", ");

const plugins = [
  // === Built-ins ===
  {
    id: "home",
    subject: "a clean dashboard with a centered circular glowing launch button surrounded by small icon tiles",
    accent: "warm amber accent",
  },
  {
    id: "files",
    subject: "a stylized file tree panel on the left with indented folder/file rows and a single highlighted file in cyan",
    accent: "cool teal accent",
  },
  {
    id: "settings",
    subject: "a stylized settings panel with horizontal toggle switches and section dividers, blue accent",
    accent: "electric blue accent",
  },
  {
    id: "music",
    subject: "a stylized music player card with an album-art square, a horizontal waveform, a play button, and a volume slider",
    accent: "magenta-pink accent",
  },
  {
    id: "runtime",
    subject: "a stylized runtime monitor with a glowing circular pulse, three horizontal meters, and a small line graph",
    accent: "vivid orange accent",
  },
  {
    id: "playground",
    subject: "a stylized developer playground with a code editor block on the left, a run button, and a small output panel on the right",
    accent: "violet accent",
  },
  {
    id: "w9y",
    subject: "a stylized package manager with stacked package cards each showing a tiny version tag and an install badge",
    accent: "emerald accent",
  },
  {
    id: "workbench",
    subject: "a stylized IDE workbench with a file sidebar, a centered code editor with syntax-colored tokens, and a bottom terminal",
    accent: "deep blue accent",
  },
  {
    id: "deck",
    subject: "a stylized presentation slide carousel with three overlapping rounded panels showing abstract chart shapes",
    accent: "indigo accent",
  },
  {
    id: "launcher",
    subject: "a stylized rocket-themed launcher with a large centered icon grid and a search bar at the top",
    accent: "amber accent",
  },
  {
    id: "spotlight",
    subject: "a stylized spotlight search overlay with a centered rounded search box, a few keyboard shortcut hints below, and a soft halo behind",
    accent: "lilac accent",
  },
  {
    id: "group",
    subject: "a stylized group chat window with three stacked message bubbles of varying widths and two overlapping circular avatars",
    accent: "sky blue accent",
  },
  {
    id: "crush",
    subject: "a stylized terminal with a single prompt line and a colorful ascii-art heart made of characters",
    accent: "hot pink accent",
  },
  {
    id: "crush-playground",
    subject: "a stylized split-pane view with a chat-style input on the left and a tool-call preview pane on the right",
    accent: "magenta accent",
  },
  {
    id: "notes",
    subject: "a stylized markdown notes editor with three paragraphs of placeholder lines and a left-aligned gutter with bullet markers",
    accent: "amber accent",
  },
  {
    id: "glmatrix",
    subject: "a stylized matrix-style falling character rain effect with thin vertical columns of glowing green glyphs against deep black",
    accent: "matrix green accent",
  },
  {
    id: "web-pet",
    subject: "a stylized cute desktop pet creature — a small round shiba dog character with glowing eyes on a soft pastel podium",
    accent: "warm coral accent",
  },
  {
    id: "widgetbot",
    subject: "a stylized Discord-style chat widget panel with a server icon, a channel list, and three rounded chat bubbles",
    accent: "blurple accent",
  },
  {
    id: "default-page",
    subject: "a stylized empty default-page hero with a large glowing centered star and subtle radial light",
    accent: "soft violet accent",
  },
  {
    id: "shell-tools",
    subject: "a stylized toolbox with three floating tool icons (wrench, terminal, file) arranged in a small triangle",
    accent: "silver accent",
  },
  {
    id: "examples",
    subject: "a stylized folder of demo tiles — a 2x2 grid of rounded mini cards each showing an abstract demo icon",
    accent: "teal accent",
  },
  {
    id: "rickroll",
    subject: "a stylized vintage music video thumbnail — neon 80s chrome text shape with palm-tree silhouettes and a soft pink-orange sunset gradient",
    accent: "neon pink-orange accent",
  },
  // === Iframe plugins ===
  {
    id: "browser",
    subject: "a stylized web browser window with a top URL bar, three small tabs, and a softly glowing empty page",
    accent: "steel blue accent",
  },
  {
    id: "bonsai",
    subject: "a stylized miniature bonsai tree in a small ceramic pot, gently lit from above with a soft halo",
    accent: "sage green accent",
  },
  {
    id: "codigo",
    subject: "a stylized code editor in a dark window with a vertical column of colorful token dots representing syntax highlighting",
    accent: "coral accent",
  },
  {
    id: "rv64",
    subject: "a stylized RISC-V chip — a square silicon die with a subtle circuit pattern and a tiny riscv logo etching in the center",
    accent: "warm orange accent",
  },
  {
    id: "v86",
    subject: "a stylized x86 vintage CPU — a beige ceramic DIP package with golden pins and a small etched label",
    accent: "amber accent",
  },
  {
    id: "app-store",
    subject: "a stylized storefront — a grid of three small app cards with icons, an install button, and a search bar at the top",
    accent: "violet accent",
  },
  {
    id: "gearshell-docs",
    subject: "a stylized API documentation page with a left sidebar TOC, a centered markdown block, and a small code snippet card",
    accent: "soft blue accent",
  },
  {
    id: "bubbletea-playground",
    subject: "a stylized TUI playground — a dark terminal-style box with a vertical list of selectable rows and one highlighted row",
    accent: "rose accent",
  },
  {
    id: "terminal-frame",
    subject: "a stylized terminal window with a single line of input, a blinking cursor, and a thin title bar with three traffic-light dots",
    accent: "lime accent",
  },
  {
    id: "lucide-icons",
    subject: "a stylized icon catalog — a 4x4 grid of simple monochrome icon glyphs (star, heart, square, circle, triangle, etc.) on a dark surface",
    accent: "neutral white accent",
  },
  {
    id: "iframe-template",
    subject: "a stylized empty iframe template — a plain rounded placeholder card with a small chevron-up icon in the corner",
    accent: "muted slate accent",
  },
];

function runMmx(prompt, outPath) {
  return new Promise((resolveRun, rejectRun) => {
    const args = [
      "image", "generate",
      "--prompt", prompt,
      "--aspect-ratio", "1:1",
      "--out", outPath,
      "--quiet",
    ];
    const proc = spawn("mmx", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => stderr += chunk.toString());
    proc.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`mmx exited ${code}: ${stderr}`));
    });
  });
}

async function main() {
  let ok = 0, fail = 0;
  for (const p of plugins) {
    const out = resolve(OUT, `${p.id}.png`);
    const prompt = `${p.subject}. ${STYLE}. ${p.accent}, soft glow, premium look, 1:1 ratio.`;
    process.stdout.write(`[${p.id}] generating ... `);
    try {
      await runMmx(prompt, out);
      ok += 1;
      process.stdout.write("ok\n");
    } catch (err) {
      fail += 1;
      process.stdout.write(`FAIL: ${err.message}\n`);
    }
  }
  process.stdout.write(`\nDone: ${ok} ok, ${fail} failed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});