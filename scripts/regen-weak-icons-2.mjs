#!/usr/bin/env node
// scripts/regen-weak-icons-2.mjs — third pass: regenerate the remaining
// icons that are still too small or that the model misinterpreted
// (deck → chat bubble, widgetbot → PlayStation controller, etc.).

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OUT = resolve(REPO, "plugin/app-store/previews");
mkdirSync(OUT, { recursive: true });

const STYLE = [
  "Pure flat black background (#000000), no gradient, no texture, no noise",
  "Single centered subject that FILLS the frame — the subject must occupy 75% to 90% of the canvas, edge-to-edge bold shapes",
  "No glow halo, no aura, no light bloom, no outer ring, no soft fade",
  "No drop shadow, no floor reflection, no surface",
  "No frame, no border, no window, no device, no card outline",
  "Subject rendered only in the single accent color below — no secondaries, no shading gradients",
  "Bold, thick, graphic shapes — readable at 32px",
  "No text, no labels, no watermarks",
  "1:1 square format",
].join(", ");

const list = [
  // Too small
  {
    id: "lucide-icons",
    subject: "a single large bold compass star with four thick diamond-shaped points radiating from a solid center dot, the compass fills the entire frame edge to edge",
    accent: "warm white #f5f5f5",
  },
  {
    id: "widgetbot",
    subject: "a single Discord speech-bubble logo shape — a stylized rounded chat bubble with two small horn-like shapes on top and two small dot eyes inside, the bubble fills the frame",
    accent: "blurple #5865f2",
  },
  {
    id: "bonsai",
    subject: "a single large bonsai tree silhouette in a thick bowl-shaped pot, the tree's trunk curves dramatically, the bonsai fills 75% of the frame",
    accent: "sage green #84cc16",
  },
  // Misinterpreted subject
  {
    id: "deck",
    subject: "a stack of three large presentation slides — three thick rectangle cards with rounded corners, stacked at a slight angle with the front card showing three thick horizontal lines",
    accent: "indigo #818cf8",
  },
  // Other weak ones from the first review
  {
    id: "codigo",
    subject: "a single bold pair of angle brackets < >, thick and chunky, very large, dominating the frame",
    accent: "coral #f87171",
  },
  {
    id: "browser",
    subject: "a single large wireframe globe — a circle with thick curved latitude and longitude lines drawn through it, the globe fills the frame",
    accent: "steel blue #3b82f6",
  },
  {
    id: "app-store",
    subject: "a single large bold capital letter A, thick geometric sans-serif, centered, fills 70% of the frame",
    accent: "violet #a78bfa",
  },
  {
    id: "crush-playground",
    subject: "a single large wrench icon combined with a single speech bubble outline, the two shapes overlapping in the middle, both thick and bold",
    accent: "magenta #d946ef",
  },
  {
    id: "launcher",
    subject: "a single large rocket icon pointing straight up, thick bold geometric body with two side fins and a thick flame at the bottom",
    accent: "amber #f59e0b",
  },
  {
    id: "spotlight",
    subject: "a single large magnifying glass icon — a thick circle (lens) on top of a thick angled handle, the glass dominates the frame",
    accent: "lilac #c084fc",
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