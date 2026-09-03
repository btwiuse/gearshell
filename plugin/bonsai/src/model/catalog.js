// Model metadata belongs here rather than being inferred from a weight URL.
// Bonsai-27B's GGUF repository does not publish the tokenizer files bitgpu needs.
const BITGPU_MODEL_BASE =
  "https://cdn.jsdelivr.net/gh/stfurkan/bitgpu@v0.19.1/models/bonsai-27b-gguf";

export const BONSAI_27B = Object.freeze({
  id: "prism-ml/Bonsai-27B-gguf",
  ggufFile: "Bonsai-27B-Q1_0.gguf",
  tokenizerRepository: "prism-ml/Bonsai-27B-unpacked",
  // Generated and GPU-validated by bitgpu for this exact GGUF container.
  manifestUrl: `${BITGPU_MODEL_BASE}/manifest.json`,
  auxUrl: `${BITGPU_MODEL_BASE}/Bonsai-27B-Q1_0.aux.bin`,
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
});

function isHttpUrl(value) {
  return /^https?:/i.test(value);
}

export function resolveGgufUrl(source, file = BONSAI_27B.ggufFile) {
  if (source.toLowerCase().endsWith(".gguf")) {
    return isHttpUrl(source) ? source : new URL(source, location.href).href;
  }
  return `https://huggingface.co/${source}/resolve/main/${file}`;
}

export function modelDirectory(url) {
  return url.slice(0, url.lastIndexOf("/"));
}

export function tokenizerDirectory(source, ggufUrl) {
  return source === BONSAI_27B.id
    ? `https://huggingface.co/${BONSAI_27B.tokenizerRepository}/resolve/main`
    : modelDirectory(ggufUrl);
}
