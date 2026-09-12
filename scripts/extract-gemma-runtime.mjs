import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourcePath = resolve(root, "plugin", "webllm", "gemma-4-e2b.js");
const outputPath = resolve(root, "inference", "gemma-runtime.js");
const runtime = await readFile(sourcePath, "utf8");

if (!runtime.includes("Gemma4Mobile")) {
  throw new Error("plugin/webllm/gemma-4-e2b.js does not expose Gemma4Mobile.");
}

const output = `${runtime}\nexport const Gemma4Mobile = globalThis.Gemma4Mobile;\n`;
if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output) {
    throw new Error("inference/gemma-runtime.js is not synchronized. Run extract-gemma-runtime.mjs.");
  }
  console.log(`Verified ${outputPath} (${Buffer.byteLength(output)} bytes).`);
} else {
  await writeFile(outputPath, output);
  console.log(`Wrote ${outputPath} (${Buffer.byteLength(output)} bytes).`);
}
