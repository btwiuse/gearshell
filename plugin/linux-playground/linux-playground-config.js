export const DEFAULT_PROXY_URL = "https://no-cors.up.railway.app/";

const RV64_RELEASE = "https://github.com/justwasm/rv64.js/releases/download/v0.4.34";
const V86_RELEASE = "https://github.com/justwasm/wanix/releases/download/v0.4.53";
const ARCH_RELEASE = "https://github.com/btwiuse/archlinux/releases/latest";
// Each guest combines independent emulator, kernel, rootfs, and a
// per-architecture Wanix overlay. Rootfs profiles carry their own
// userland packages; kernel profiles remain independently selectable.
const guestRootfs = (arch, profile = "") => `${RV64_RELEASE}/wanix-linux-${arch}${profile}.tgz`;
const VM_ARCH = { rv64: "riscv64" };
const guestOverlay = (arch) => `${RV64_RELEASE}/wanix-overlay-${VM_ARCH[arch] || arch}.tgz`;
// Kernels ship raw. GitHub release CDN applies transport gzip on
// HTTPS when the client sends Accept-Encoding: gzip; emulator
// adapters read the kernel from the 9p filesystem (v86 auto-
// discovers boot/vmlinuz*; rv64 hardcodes /boot/Image), so the
// bytes on disk have to be raw ELF.
const guestKernel = (arch, profile = "") => {
  const suffix = profile ? `-${profile}` : "";
  return `${RV64_RELEASE}/rv64-kernel-${VM_ARCH[arch] || arch}${suffix}`;
};
// Arch Linux rootfs lives in btwiuse/archlinux. Map wanix-side arch
// names to the btwiuse/archlinux tarball suffixes, then compose the
// URL for either base or bootstrap variants.
const ARCH_TARBALL_ARCH = {
  rv64: "riscv64",
  riscv64: "riscv64",
  x86: "i686",
  i686: "i686",
  arm64: "aarch64",
  aarch64: "aarch64",
};
const archRootfs = (arch, kind = "base") => {
  const suffix = ARCH_TARBALL_ARCH[arch] || arch;
  const prefix = ARCH_TARBALL_KIND[kind] || ARCH_TARBALL_KIND.base;
  return `${ARCH_RELEASE}/download/${prefix}-${suffix}.tar.gz`;
};
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

const preset = (architecture, backend, image, overlay, kernel, memory = "1024M") => ({ architecture, backend, image, overlay, kernel, bootRc: null, postDhcp: null, append: "", memory });
const x86Backend = `${V86_RELEASE}/v86.tgz`;
const rv64Backend = `${RV64_RELEASE}/rv64.tgz`;
const guestProfiles = [
  ["minimal", "", "Alpine minimal"],
  ["crush", "-crush", "Crush agent"],
  ["python", "-python", "Python and uv"],
  ["nodejs", "-nodejs", "Node.js and npm"],
  ["claude", "-claude", "Claude Code Best"],
  ["peri", "-peri", "Peri agent"],
  ["zero", "-zero", "Zero CLI"],
  ["pi", "-pi", "Pi Coding Agent"],
  ["golang", "-golang", "Go"],
  ["container", "-container", "Container kernel"],
  ["container-full", "-container-full", "Container full"],
];

// Arch Linux presets: pair btwiuse/archlinux base/bootstrap tarballs
// with the matching rv64.js kernel. Base is wanix-ready (post-pacstrap
// with users/locale/etc); bootstrap is the raw pacstrap output for
// users who want a smaller, untuned system.
const ARCH_TARBALL_KIND = {
  base: "archlinux-base",
  bootstrap: "archlinux-bootstrap",
};
const archProfiles = [
  ["minimal-base", "Arch base", "base"],
  ["minimal-bootstrap", "Arch bootstrap", "bootstrap"],
];

export const presetGroups = [
  { id: "v86", title: "x86 · v86", architecture: "v86", backend: x86Backend, imageArch: "x86", rootfs: "alpine" },
  { id: "rv64", title: "RISC-V 64 · rv64.js", architecture: "rv64", backend: rv64Backend, imageArch: "rv64", rootfs: "alpine" },
  { id: "rv64-arch", title: "RISC-V 64 · Arch Linux", architecture: "rv64", backend: rv64Backend, imageArch: "rv64", rootfs: "arch" },
  { id: "v86-arch", title: "x86 · Arch Linux", architecture: "v86", backend: x86Backend, imageArch: "i686", rootfs: "arch" },
];

export const presets = Object.fromEntries([
  ...presetGroups
    .filter((group) => group.rootfs === "alpine")
    .flatMap((group) => guestProfiles.map(([name, suffix, label]) => [
      `${group.id}-${name}`,
      { ...preset(group.architecture, group.backend, guestRootfs(group.imageArch, suffix), guestOverlay(group.imageArch), guestKernel(group.imageArch, name === "container" || name === "container-full" ? "container" : "minimal"), name === "container-full" ? "2048M" : "1024M"), label, profile: name, group: group.id },
    ])),
  ...presetGroups
    .filter((group) => group.rootfs === "arch")
    .flatMap((group) => archProfiles.map(([name, label, kind]) => [
      `${group.id}-${name}`,
      { ...preset(group.architecture, group.backend, archRootfs(group.imageArch, kind), guestOverlay(group.imageArch), guestKernel(group.imageArch, "minimal"), "1024M"), label, profile: name, rootfs: "arch", archKind: kind, group: group.id },
    ])),
]);

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
