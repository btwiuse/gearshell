#!/usr/bin/env node
// scripts/regen-weak-icons.mjs — second-pass regeneration for icons
// that came out too small, too generic, or kept a glowing halo on the
// second pass. The shared prompt is reinforced and the per-plugin
// subject text is rewritten to be more specific / larger.
//
//   node scripts/regen-weak-icons.mjs

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OUT = resolve(REPO, "plugin/app-store/previews");
mkdirSync(OUT, { recursive: true });

// Stronger visual recipe. Explicitly bans glow, frame, halos, drop
// shadows. The subject size target is now specified with a "fill"
// command rather than a percent (the model interprets percentages
// loosely).
const STYLE = [
  "Pure flat black background (#000000), no gradient, no texture, no noise",
  "Single centered subject filling the entire frame, edge to edge — the edges of the subject should reach close to the four sides of the square",
  "No glow halo around the subject, no aura, no light bloom, no outer ring",
  "No drop shadow, no floor reflection, no surface under the subject",
  "No frame, no border, no window, no device, no card outline",
  "Subject rendered only in the single accent color below",
  "Bold, thick, graphic shapes — readable at 32px",
  "No text, no labels, no watermarks, no logos",
  "1:1 square format",
].join(", ");

const list = [
  // ===== Subject too small =====
  {
    id: "settings",
    subject: "a single huge gear / cog with twelve thick teeth, viewed straight-on, the gear fills 75% of the frame",
    accent: "electric blue #60a5fa",
  },
  {
    id: "runtime",
    subject: "a single thick concentric ring pattern — three thick solid rings around a central glowing dot, the rings are clearly visible and opaque",
    accent: "vivid orange #fb923c",
  },
  {
    id: "home",
    subject: "a single large house silhouette filling the frame — a thick-walled pentagon shape with a centered door cut out, solid filled",
    accent: "warm amber #fbbf24",
  },
  {
    id: "group",
    subject: "a cluster of three large solid overlapping circles, two on the bottom and one centered above, like a Venn diagram of three people, the circles fill 70% of the frame",
    accent: "sky blue #38bdf8",
  },
  {
    id: "glmatrix",
    subject: "a wide block of falling characters — five thick vertical columns of katakana-style glyphs glowing green, filling the full frame",
    accent: "matrix green #22c55e",
  },

  // ===== Glowing-halo badges — rewrite without the halo =====
  {
    id: "notes",
    subject: "a single large notepad icon — a thick rectangle with a spiral binding on the left edge and three horizontal lines inside, the notepad fills the frame, NO glow around it",
    accent: "amber #f59e0b",
  },
  {
    id: "default-page",
    subject: "a single large five-pointed star, thick filled, centered, NO glow",
    accent: "soft violet #c4b5fd",
  },
  {
    id: "spotlight",
    subject: "a single large magnifying glass with thick handle, the lens takes up the upper half, NO glow, NO halo",
    accent: "lilac #c084fc",
  },
  {
    id: "bubbletea-playground",
    subject: "a single large teacup with a thick handle on the right and three thick steam wisps rising above, NO glow",
    accent: "rose #fb7185",
  },

  // ===== Placeholder / generic subjects — make distinctive =====
  {
    id: "examples",
    subject: "a 2x2 grid of four small solid squares, each square a slightly different color but all in the same hue family",
    accent: "teal #2dd4bf",
  },
  {
    id: "deck",
    subject: "three overlapping rounded rectangle cards stacked at an angle, the front card has three thick horizontal lines inside, representing slides",
    accent: "indigo #818cf8",
  },
  {
    id: "gearshell-docs",
    subject: "a single open book shape viewed from above, two facing pages with thick horizontal lines on each, a thick center spine",
    accent: "soft blue #60a5fa",
  },

  // ===== Workbench is currently weak — rewrite to a clear symbol =====
  {
    id: "workbench",
    subject: "a single thick wrench icon, bold and chunky, viewed at a slight angle, the wrench fills the frame",
    accent: "deep blue #6366f1",
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
  for (const p of list) {
    const out = resolve(OUT, `${p.id}.png`);
    const prompt = [
      `Subject: ${p.subject}.`,
      `Style: ${STYLE}.`,
      `Single accent color for the subject: ${p.accent}.`,
      `Background must be pure flat black (#000000), no other colors anywhere except the accent on the subject.`,
    ].join(" ");
    process.stdout.write(`[${p.id}] regenerating ... `);
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