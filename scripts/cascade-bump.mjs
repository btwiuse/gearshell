// One-shot version cascade propagator for the ?v= discipline.
// Usage: node scripts/cascade-bump.mjs panels.js launcher.js
// Bumps the token of every dirty module in all importers, then marks
// the importers dirty in turn, until the entry (index.html/app.js)
// is reached. Dry-run with --dry.
import fs from "node:fs";
import path from "node:path";

const cwd = "/Users/gear/GitHub/gearshell";
const SKIP_DIRS = new Set([
  "node_modules",
  "memory",
  "dist",
  "docs",
  "architecture-viz",
  ".git",
  "wanix-dist",
  "browser",
  "bonsai",
  "isolation",
  "wanix-workbench",
  "web-pet",
  "proxy-test-collectsub",
  ".workbuddy",
  "神奇海螺队-第一轮评审",
  "PP评估",
]);
const DRY = process.argv.includes("--dry");

function collectFiles(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) collectFiles(full, out);
    } else if (
      ent.name.endsWith(".js") || ent.name.endsWith(".mjs") ||
      ent.name === "index.html"
    ) {
      out.push(full);
    }
  }
}

function bumpToken(token) {
  const m = token.match(/^(.+?\.)(\d+)$/);
  if (!m) return `${token}.1`;
  return `${m[1]}${parseInt(m[2], 10) + 1}`;
}

const files = [];
collectFiles(cwd, files);
const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) cache.set(f, fs.readFileSync(f, "utf8"));
  return cache.get(f);
};

const dirty = process.argv.slice(2).filter((m) => m.endsWith(".js"));
const processed = new Set();
const changes = [];
let guard = 0;

while (dirty.length > 0 && guard++ < 500) {
  const base = dirty.shift();
  if (processed.has(base)) continue;
  processed.add(base);
  const re = new RegExp(
    `(?<![A-Za-z0-9_.-])${base.replace(/\./g, "\\.")}\\?v=([\\w.]+)`,
    "g",
  );
  for (const f of files) {
    const src = read(f);
    let touched = false;
    const next = src.replace(re, (full, token) => {
      touched = true;
      const bumped = bumpToken(token);
      changes.push(`${path.basename(f)}: ${base} ${token} -> ${bumped}`);
      return full.replace(token, bumped);
    });
    if (!touched) continue;
    cache.set(f, next);
    if (DRY) continue;
    const name = path.basename(f);
    if (name !== "index.html" && !f.endsWith("/verify-static.mjs")) {
      dirty.push(name);
    }
  }
}

if (DRY) {
  for (const c of changes) console.log(c);
  console.log(`${changes.length} reference bumps planned.`);
  process.exit(0);
}

for (const [f, src] of cache) fs.writeFileSync(f, src);
console.log(
  `${changes.length} reference bumps applied across ${cache.size} files.`,
);
for (const c of changes) console.log(c);
