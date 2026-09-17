export const DEFAULT_PROXY_URL = "https://no-cors.up.railway.app/";

const RV64_RELEASE = "https://github.com/justwasm/rv64.js/releases/download/v0.4.14";
const V86_RELEASE = "https://github.com/justwasm/wanix/releases/download/v0.4.48";
const guestImage = (arch, profile = "") => `${RV64_RELEASE}/wanix-linux-${arch}${profile}.tgz`;
const customPresetsKey = "linux-playground:custom-presets";
export const memorySliderMax = 1000;

export function clampMemory(value) {
  return Math.min(4096, Math.max(0, Math.round(Number(value) || 0)));
}

export function memoryFromSlider(value) {
  return clampMemory((2 ** (Number(value) / memorySliderMax * 12) - 1) / 4095 * 4096);
}

export function sliderFromMemory(value) {
  const memory = clampMemory(value);
  return Math.round(Math.log2(memory / 4096 * 4095 + 1) / 12 * memorySliderMax);
}

const preset = (architecture, backend, image, memory = "1024M") => ({ architecture, backend, image, bootRc: null, postDhcp: null, append: "", memory });
const x86Backend = `${V86_RELEASE}/v86.tgz`;
const rv64Backend = `${RV64_RELEASE}/rv64.tgz`;
const guestProfiles = [
  ["minimal", "", "Alpine minimal"],
  ["crush", "-crush", "Crush agent"],
  ["python", "-python", "Python and uv"],
  ["nodejs", "-nodejs", "Node.js and npm"],
  ["claude", "-claude", "Claude Code Best"],
  ["pi", "-pi", "Pi Coding Agent"],
  ["golang", "-golang", "Go"],
  ["container", "-container", "Container kernel"],
  ["container-full", "-container-full", "Container full"],
];

export const presetGroups = [
  { architecture: "v86", title: "x86 · v86", backend: x86Backend, imageArch: "x86" },
  { architecture: "rv64", title: "RISC-V 64 · rv64.js", backend: rv64Backend, imageArch: "rv64" },
];

export const presets = Object.fromEntries(presetGroups.flatMap((group) => guestProfiles.map(([name, suffix, label]) => [
  `${group.architecture}-${name}`,
  { ...preset(group.architecture, group.backend, guestImage(group.imageArch, suffix), name === "container-full" ? "2048M" : "1024M"), label, profile: name },
])));

export function loadCustomPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(customPresetsKey) || "[]");
    return Array.isArray(saved) ? saved.filter((preset) => preset?.id && preset?.name) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presetsToSave) {
  localStorage.setItem(customPresetsKey, JSON.stringify(presetsToSave));
}
