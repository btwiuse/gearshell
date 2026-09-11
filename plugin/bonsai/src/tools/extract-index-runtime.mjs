import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const sourcePath = resolve(root, "index.html");
const outputPath = resolve(root, "src", "model", "index-runtime.js");
const exportMarker =
  "export{di as Bonsai27B,Pw as DEFAULT_GGUF_FILE,Pd as DEFAULT_MODEL_ID,oT as default,Dd as resolveGGUFUrl};";

const html = await readFile(sourcePath, "utf8");
const moduleScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .find(([, attributes]) => /\btype\s*=\s*[\"']module[\"']/i.test(attributes))?.[2];

if (!moduleScript) {
  throw new Error("index.html has no inline module runtime.");
}

const end = moduleScript.indexOf(exportMarker);
if (end < 0) {
  throw new Error("index.html no longer contains the legacy runtime export.");
}

const runtime = moduleScript.slice(0, end + exportMarker.length);
const output = `${runtime}\n`;
if (!runtime.includes('Il="gguf-v1"') || !runtime.includes('yh="gguf-cache-v1"')) {
  throw new Error("index.html no longer contains the expected legacy cache contract.");
}

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output) {
    throw new Error("src/model/index-runtime.js is not synchronized with index.html.");
  }
  console.log(`Verified ${outputPath} (${Buffer.byteLength(runtime)} bytes).`);
} else {
  await writeFile(outputPath, output);
  console.log(`Wrote ${outputPath} (${Buffer.byteLength(runtime)} bytes).`);
}
