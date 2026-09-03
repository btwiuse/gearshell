#!/usr/bin/env node
// scripts/gen-app-store-previews.mjs — generate 1:1 app-icon-style
// preview images for every App Store plugin. This is the second pass;
// the first produced decorative card art with device frames and
// placeholder UI. This pass produces real app icons: solid black
// background, single subject, lots of negative space, recognizable at
// small sizes. Run from repo root:
//
//   node scripts/gen-app-store-previews.mjs
//
// Re-runnable: each invocation overwrites the existing PNGs.

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OUT = resolve(REPO, "plugin/app-store/previews");
mkdirSync(OUT, { recursive: true });

// Common visual recipe — the *only* anchor every prompt shares. The
// subject text differs per plugin; the rest is fixed so the catalog
// reads as one set. Key constraints:
//   - "pure black background, no gradient" keeps the canvas flat
//   - "subject rendered in the specified accent color" prevents the
//     model from defaulting to white (first pass problem)
//   - "subject occupies ~60% of the frame" prevents tiny subjects
//     (home-pass problem) AND prevents device-frame compositions
//   - "no drop shadow, no glow halo, no surface reflection" prevents
//     the rounded-card silhouette the model loves adding
const STYLE = [
  "Pure flat black background, no gradient, no texture",
  "Single centered subject, no frame, no window chrome, no device, no card outline",
  "No drop shadow, no glow halo, no surface reflection, no floor",
  "The subject is rendered only in the single accent color specified below",
  "Subject occupies ~60% of the frame, lots of negative space",
  "Minimal, clean geometric composition",
  "No text, no labels, no watermarks, no logos",
  "1:1 square format",
].join(", ");

// Per-plugin subject + accent color. Each subject is *one* thing that
// captures what the app does — not a UI snapshot. The accent is the
// only color the model is allowed to use, on a pure-black canvas.
const plugins = [
  // === Built-in component / kernel plugins ===
  {
    id: "home",
    subject: "a single glowing house silhouette, simple geometric roof + walls, soft warm light from the door",
    accent: "warm amber #fbbf24",
  },
  {
    id: "files",
    subject: "a single folder icon, the classic manila folder shape with a clean cut corner, slightly opened",
    accent: "cool cyan #22d3ee",
  },
  {
    id: "settings",
    subject: "a single gear / cog, twelve teeth, viewed straight on, clean metallic shading",
    accent: "electric blue #60a5fa",
  },
  {
    id: "music",
    subject: "a single eighth note (♪), thick bold strokes, centered, slightly tilted",
    accent: "magenta-pink #f472b6",
  },
  {
    id: "runtime",
    subject: "a single pulsing concentric ring — three concentric circles around a glowing dot, like a heartbeat",
    accent: "vivid orange #fb923c",
  },
  {
    id: "playground",
    subject: "a single stylized chevron pair ( >_ ) rendered as one solid shape, slightly tilted, hint of motion",
    accent: "violet #a78bfa",
  },
  {
    id: "w9y",
    subject: "a single 3D isometric package / box with a band of tape across it, viewed from above-front",
    accent: "emerald #34d399",
  },
  {
    id: "workbench",
    subject: "a single stylized hammer crossed with a screwdriver, forming an X",
    accent: "deep blue #6366f1",
  },
  {
    id: "deck",
    subject: "a single rectangular slide / card with three horizontal lines of varying widths inside, like a presentation card",
    accent: "indigo #818cf8",
  },
  {
    id: "launcher",
    subject: "a single stylized rocket pointing up, simple geometric fins, a small flame underneath",
    accent: "amber #f59e0b",
  },
  {
    id: "spotlight",
    subject: "a single large magnifying glass at a slight angle, with three short lines radiating from the lens",
    accent: "lilac #c084fc",
  },
  {
    id: "group",
    subject: "a cluster of three overlapping circles, two on the bottom and one centered above, like three people grouped together",
    accent: "sky blue #38bdf8",
  },
  {
    id: "crush",
    subject: "a single heart shape made of small ascii-art style pixels / squares, each square a slightly different color",
    accent: "hot pink #ec4899",
  },
  {
    id: "crush-playground",
    subject: "a single chat bubble outline overlapping a wrench icon, the two shapes interlocking",
    accent: "magenta #d946ef",
  },
  {
    id: "notes",
    subject: "a single notepad icon — a rectangle with a spiral binding on the left edge and three horizontal lines inside",
    accent: "amber #f59e0b",
  },
  {
    id: "glmatrix",
    subject: "a single vertical column of falling katakana-style characters, glowing green on black, characters trailing off into motion",
    accent: "matrix green #22c55e",
  },
  {
    id: "web-pet",
    subject: "a single cute shiba-inu dog face, front view, large round eyes, simple geometric shapes",
    accent: "warm coral #fb923c",
  },
  {
    id: "widgetbot",
    subject: "a single game controller / gamepad, viewed straight on, two grip handles and a d-pad shape",
    accent: "blurple #5865f2",
  },
  {
    id: "default-page",
    subject: "a single five-pointed star with soft glowing edges",
    accent: "soft violet #c4b5fd",
  },
  {
    id: "shell-tools",
    subject: "a single wrench and screwdriver crossed in an X shape",
    accent: "silver #94a3b8",
  },
  {
    id: "examples",
    subject: "a single grid of four small squares (2x2), each square a slightly different shade",
    accent: "teal #2dd4bf",
  },
  {
    id: "rickroll",
    subject: "a single stylized music cassette tape, viewed at a slight 3/4 angle, two visible reels",
    accent: "neon coral-red #fb7185",
  },
  // === Iframe plugins ===
  {
    id: "browser",
    subject: "a single stylized globe / wireframe sphere made of latitude and longitude lines",
    accent: "steel blue #3b82f6",
  },
  {
    id: "bonsai",
    subject: "a single stylized bonsai silhouette — a small curved tree in a tiny pot, all rendered as one minimal shape",
    accent: "sage green #84cc16",
  },
  {
    id: "codigo",
    subject: "a single pair of angle brackets < >, thick and bold, centered with strong negative space",
    accent: "coral #f87171",
  },
  {
    id: "rv64",
    subject: "a single square microchip with visible pin legs on all four sides and a tiny riscv-logo etched in the center",
    accent: "warm orange #fb923c",
  },
  {
    id: "v86",
    subject: "a single vintage CPU chip — a beige ceramic DIP package with two rows of golden pins",
    accent: "amber #d97706",
  },
  {
    id: "app-store",
    subject: "a single capital letter A inside a thin rounded square outline, like a storefront sign",
    accent: "violet #a78bfa",
  },
  {
    id: "gearshell-docs",
    subject: "a single open book viewed from above, two facing pages visible with abstract horizontal lines",
    accent: "soft blue #60a5fa",
  },
  {
    id: "bubbletea-playground",
    subject: "a single stylized teacup with steam rising from it, simple flat shapes",
    accent: "rose #fb7185",
  },
  {
    id: "terminal-frame",
    subject: "a single chevron prompt character (>) followed by a small blinking cursor block",
    accent: "lime #84cc16",
  },
  {
    id: "lucide-icons",
    subject: "a single four-pointed compass star, geometric and minimal, centered",
    accent: "warm white #f5f5f5",
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
    const prompt = [
      `Subject: ${p.subject}.`,
      `Style: ${STYLE}.`,
      `Single accent color for the subject: ${p.accent}.`,
      `Background must be pure flat black (#000000), no other colors anywhere except the accent on the subject.`,
    ].join(" ");
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