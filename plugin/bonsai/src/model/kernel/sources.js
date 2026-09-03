// Read-only access to the WGSL files that produced the pinned bitgpu release.
//
// bitgpu exposes compiled pipelines rather than its internal source table. The
// inspector reads the matching tagged repository files only when it is opened.
const BITGPU_TAG = "v0.19.1";
const PACKAGE_INDEX_URL =
  `https://data.jsdelivr.com/v1/package/gh/stfurkan/bitgpu@${BITGPU_TAG}/flat`;
const SHADER_BASE_URL = `https://cdn.jsdelivr.net/gh/stfurkan/bitgpu@${BITGPU_TAG}/shaders/`;

let catalogRequest = null;

function shaderName(file) {
  return file.slice("/shaders/".length, -".wgsl".length);
}

async function fetchShaderCatalog() {
  const response = await fetch(PACKAGE_INDEX_URL);
  if (!response.ok) {
    throw new Error(
      `Unable to read bitgpu source index (HTTP ${response.status}).`,
    );
  }

  const { files = [] } = await response.json();
  const shaderFiles = files
    .map((file) => file.name)
    .filter((name) => name.startsWith("/shaders/") && name.endsWith(".wgsl"))
    .sort();

  return Promise.all(
    shaderFiles.map(async (file) => {
      const response = await fetch(
        `${SHADER_BASE_URL}${file.slice("/shaders/".length)}`,
      );
      if (!response.ok) {
        throw new Error(`Unable to read ${file} (HTTP ${response.status}).`);
      }
      return { name: shaderName(file), source: await response.text() };
    }),
  );
}

export function loadBitgpuKernelSources() {
  if (!catalogRequest) {
    catalogRequest = fetchShaderCatalog().catch((error) => {
      catalogRequest = null;
      throw error;
    });
  }
  return catalogRequest;
}
