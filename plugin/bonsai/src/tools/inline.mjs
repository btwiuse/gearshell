#!/usr/bin/env node
// tools/inline.mjs
//
// Bundle buildless.html into a single self-contained HTML file by:
//   1. Calling esbuild to bundle each module entry (config, loader,
//      background, prism, garden, app) and the CSS set.
//   2. Inlining the bundled JS / CSS back into buildless.html so the
//      resulting file has no external dependencies except the pinned
//      CDN three.min.js.
//
// Output: dist/buildless.bundled.html

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const outDir = resolve(root, "dist");
const tmpDir = resolve(here, "..", "inline-tmp");

// ES module entries — each becomes its own <script type="module"> in
// the bundled output, in this order. Order matters: config → loader
// must run before the scene modules that read window.SEED etc.
const JS_ENTRIES = [
  "src/core/config.js",
  "src/core/loader.js",
  "src/scenes/background.js",
  "src/scenes/prism/index.js",
  "src/scenes/garden/index.js",
  "src/core/app.js",
];

// CSS files concatenated into one <style> block.
const CSS_ENTRIES = [
  "src/ui/landing.css",
  "src/ui/access-gate.css",
  "src/chat/shell.css",
  "src/chat/header.css",
  "src/chat/thread.css",
  "src/chat/message.css",
  "src/chat/markdown.css",
  "src/chat/composer.css",
  "src/model/kernel/inspector.css",
  "src/ui/app.css",
];

async function esbuild(args) {
  const { stdout, stderr } = await execFileP("esbuild", args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stderr) process.stderr.write(stderr);
  return stdout;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // 1. Bundle each module entry to a separate ESM file.
  const bundledJs = {};
  for (const entry of JS_ENTRIES) {
    const outPath = resolve(tmpDir, entry);
    await esbuild([
      "--bundle",
      "--target=es2020",
      "--format=esm",
      "--legal-comments=none",
      "--log-level=warning",
      `--outfile=${outPath}`,
      resolve(root, entry),
    ]);
    bundledJs[entry] = await readFile(outPath, "utf8");
  }

  // 2. Bundle CSS — concatenate per-file bundles into one big string.
  const cssChunks = [];
  for (const cssEntry of CSS_ENTRIES) {
    const outPath = resolve(tmpDir, cssEntry);
    await esbuild([
      "--bundle",
      "--log-level=warning",
      `--outfile=${outPath}`,
      resolve(root, cssEntry),
    ]);
    cssChunks.push(await readFile(outPath, "utf8"));
  }
  const cssText = cssChunks.join("\n");

  // 3. Splice.
  const html = await readFile(resolve(root, "buildless.html"), "utf8");
  let out = html;

  out = out.replace(
    /<link rel="stylesheet" href="src\/[^"]+"\s*\/>\n?/g,
    "",
  );
  out = out.replace(
    "</head>",
    `    <style>\n${cssText}\n    </style>\n  </head>`,
  );

  for (const entry of JS_ENTRIES) {
    const escaped = entry.replace(/\./g, "\\.");
    const re = new RegExp(`<script type="module" src="${escaped}"></script>`);
    out = out.replace(
      re,
      `<script type="module">\n${bundledJs[entry]}\n    </script>`,
    );
  }

  const outPath = resolve(outDir, "buildless.bundled.html");
  await writeFile(outPath, out);

  const size = (await stat(outPath)).size;
  console.log(
    `Wrote ${outPath}\n` +
      `  ${JS_ENTRIES.length} ES module entries inlined\n` +
      `  ${CSS_ENTRIES.length} CSS files concatenated\n` +
      `  total size: ${(size / 1024).toFixed(1)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});