// scripts/extract-runtime.mjs — vendor plugin/webllm/bonsai-27b.js as
// inference/runtime.js so the host Worker (inference/host-worker.js)
// has its own copy without a brittle relative path back into the
// plugin bundle.
//
// The runtime is shipped pre-patched by the upstream webllm build:
// tools, rawText, and prefill telemetry are already in place, so this
// script is now a plain vendor copy (was an HTML-extraction step when
// the source lived in bonsai/index.html).
//
// Module vs classic script: bonsai-27b.js is shipped as a classic
// script (no `export` statements; uses globalThis side effects).
// The inference host runs in a module Worker and prefers
// `import { Bonsai27B } from "./runtime.js"` over touching globalThis
// across module boundaries. We append an ES module shim after the
// vendored classic body that re-exports the runtime's globals. The
// shim reads from the same module's globalThis after the classic body
// has executed, so the order matters: classic body first, exports
// second.
//
// The --check mode verifies inference/runtime.js still matches the
// vendor source. Pass --with-exports to also include the ES shim in
// the comparison (default — the shim is required for the host).

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

// ES module shim appended after the classic body. Re-exports the
// runtime's globals so module-import consumers (the inference host)
// don't need to reach into globalThis across module boundaries.
//
// Names match what plugin/webllm/bonsai-27b.js assigns. The rename
// `BonsaiResolveGGUFUrl` (instead of `resolveGGUFUrl`) avoids
// collision when the runtime is loaded into a page that already has
// its own `resolveGGUFUrl` symbol — webllm added the `Bonsai` prefix
// for that reason and we keep it.
const ES_SHIM = `
// ES module re-export shim — exposes the runtime's globals so the
// inference host's module Worker can do a regular ES module import
// instead of reaching into globalThis across the module/classic
// boundary. The classic body above has already run by the time
// this shim evaluates (the import triggers top-level execution),
// so the global reads below see the assigned values.
export const Bonsai27B = globalThis.Bonsai27B;
export const DEFAULT_MODEL_ID = globalThis.BONSAI_DEFAULT_MODEL_ID;
export const DEFAULT_GGUF_FILE = globalThis.BONSAI_DEFAULT_GGUF_FILE;
export const BonsaiResolveGGUFUrl = globalThis.BonsaiResolveGGUFUrl;
`;

const output = `${runtime}\n${ES_SHIM}`;

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output) {
    throw new Error(
      "inference/runtime.js is not synchronized with plugin/webllm/bonsai-27b.js. "
        + "Run `node scripts/extract-runtime.mjs` to refresh.",
    );
  }
  console.log(
    `Verified ${outputPath} (${Buffer.byteLength(output)} bytes).`,
  );
} else {
  await writeFile(outputPath, output);
  console.log(
    `Wrote ${outputPath} (${Buffer.byteLength(output)} bytes).`,
  );
}
