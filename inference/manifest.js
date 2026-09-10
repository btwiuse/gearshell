// inference/manifest.js — model catalog for the inference host.
//
// The plugin/bonsai page used to embed its own catalog (plugin/bonsai/src/
// model/catalog.js). Centralising it here lets the host serve multiple
// models from one place and exposes a single source of truth for the
// shell's GearShell.inference.list() response.
//
// To add a model: append to MODELS with at minimum { id, label, size,
// ggufUrl, ctx, runtime }. The host's loadModel() resolves by id.

const BITGPU_MODEL_BASE =
  "https://cdn.jsdelivr.net/gh/stfurkan/bitgpu@v0.19.1/models/bonsai-27b-gguf";

// Each entry is the contract between the shell and the host. `runtime`
// defaults apply when the host constructs a bitgpu engine (see
// bitgpu-engine.js). `manifestUrl` / `auxUrl` are bitgpu's expected
// pre-baked metadata files for the official Bonsai release; custom
// GGUFs use fromGguf() at load time instead.
export const MODELS = [
  Object.freeze({
    id: "prism-ml/Bonsai-27B-gguf",
    label: "Bonsai 27B",
    description:
      "27-billion parameter dense model quantised to 1-bit precision (3.8 GB).",
    size: 3.8e9,
    ctx: 4096,
    ggufFile: "Bonsai-27B-Q1_0.gguf",
    manifestUrl: `${BITGPU_MODEL_BASE}/manifest.json`,
    auxUrl: `${BITGPU_MODEL_BASE}/Bonsai-27B-Q1_0.aux.bin`,
    tokenizerRepository: "prism-ml/Bonsai-27B-unpacked",
    defaultGeneration: Object.freeze({
      temperature: 0.5,
      topP: 0.85,
      topK: 20,
    }),
    runtime: Object.freeze({
      kvCache: "q8",
      activation: "f16",
      overflow: "error",
    }),
  }),
];

const MODEL_BY_ID = new Map(MODELS.map((entry) => [entry.id, entry]));

export function getModel(id) {
  return MODEL_BY_ID.get(id) ?? null;
}

export function listModels() {
  return MODELS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    size: entry.size,
    ctx: entry.ctx,
  }));
}

export function isHttpUrl(value) {
  return /^https?:/i.test(value);
}

export function resolveGgufUrl(source, file) {
  if (typeof source === "string" && source.toLowerCase().endsWith(".gguf")) {
    return isHttpUrl(source) ? source : new URL(source, location.href).href;
  }
  return `https://huggingface.co/${source}/resolve/main/${file}`;
}

export function modelDirectory(url) {
  return url.slice(0, url.lastIndexOf("/"));
}

export function tokenizerDirectory(source, ggufUrl) {
  if (source === "prism-ml/Bonsai-27B-gguf") {
    return "https://huggingface.co/prism-ml/Bonsai-27B-unpacked/resolve/main";
  }
  return modelDirectory(ggufUrl);
}
