// scripts/extract-runtime.mjs — vendor plugin/webllm/bonsai-27b.js as
// inference/runtime.js so the host Worker (inference/host-worker.js)
// has its own copy without a brittle relative path back into the
// plugin bundle.
//
// The runtime is shipped pre-patched by the upstream webllm build:
// tools, rawText, and prefill telemetry are already in place, so this
// script is now a plain vendor copy (was an HTML-extraction step when
// the source lived in bonsai/index.html). The --check mode verifies
// inference/runtime.js still matches plugin/webllm/bonsai-27b.js.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourcePath = resolve(root, "plugin", "webllm", "bonsai-27b.js");
const outputPath = resolve(root, "inference", "runtime.js");

const runtime = await readFile(sourcePath, "utf8");

if (!runtime.includes('Il="gguf-v1"') || !runtime.includes('yh="gguf-cache-v1"')) {
  throw new Error(
    "plugin/webllm/bonsai-27b.js no longer contains the expected cache contract.",
  );
}

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== runtime) {
    throw new Error(
      "inference/runtime.js is not synchronized with plugin/webllm/bonsai-27b.js. "
        + "Run `node scripts/extract-runtime.mjs` to refresh.",
    );
  }
  console.log(
    `Verified ${outputPath} (${Buffer.byteLength(runtime)} bytes).`,
  );
} else {
  await writeFile(outputPath, runtime);
  console.log(
    `Wrote ${outputPath} (${Buffer.byteLength(runtime)} bytes).`,
  );
}
