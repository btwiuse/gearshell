#!/usr/bin/env node
// scripts/regen-weak-icons-3.mjs — fourth pass: just the icons that are
// still tiny or visually weak after three passes.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const OUT = resolve(REPO, "plugin/app-store/previews");
mkdirSync(OUT, { recursive: true });

const STYLE = [
  "Pure flat black background (#000000)",
  "Single centered subject filling 85% of the canvas, edge to edge",
  "Solid colored shapes only, no gradient shading, no soft fade, no glow, no halo",
  "No frame, no border, no window chrome",
  "Subject rendered only in the single accent color",
  "Bold graphic shapes, readable at 32px",
  "No text, no labels",
  "1:1 square format",
].join(", ");

const list = [
  {
    id: "rv64",
    subject: "a single huge solid square microchip — a thick square die with small rectangular pin legs sticking out from all four sides, the chip fills the frame",
    accent: "warm orange #fb923c",
  },
  {
    id: "terminal-frame",
    subject: "a single huge bold greater-than symbol >, very thick strokes, solid filled, dominating the frame",
    accent: "lime green #84cc16",
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
      process.stdout.write("ok\n");
    } catch (err) {
      process.stdout.write(`FAIL: ${err.message}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});