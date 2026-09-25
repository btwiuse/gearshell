export const VM_RESOURCE_VERSIONS = Object.freeze({
  wanix: "v0.4.58",
  guest: "v0.4.40",
});

const WANIX_RELEASE = "https://github.com/justwasm/wanix/releases/download";
const GUEST_RELEASE = "https://github.com/justwasm/rv64.js/releases/download";

export function wanixReleaseAsset(name) {
  return `${WANIX_RELEASE}/${VM_RESOURCE_VERSIONS.wanix}/${name}`;
}

export function guestReleaseAsset(name) {
  return `${GUEST_RELEASE}/${VM_RESOURCE_VERSIONS.guest}/${name}`;
}

export const WANIX_RUNTIME_ASSETS = Object.freeze({
  moduleUrl: `https://cdn.jsdelivr.net/gh/justwasm/wanix@${VM_RESOURCE_VERSIONS.wanix}/dist/wanix.min.js`,
  wasmUrl: `https://w9y.io/go/github.com/justwasm/wanix/wasm@${VM_RESOURCE_VERSIONS.wanix}`,
});

export const VM_ASSETS = Object.freeze({
  v86: Object.freeze({
    backendUrl: wanixReleaseAsset("v86.tgz"),
    linuxUrl: guestReleaseAsset("wanix-linux-x86.tgz"),
    overlayUrl: guestReleaseAsset("wanix-overlay-x86.tgz"),
    kernelArchiveUrl: guestReleaseAsset("rv64-kernel-x86-minimal.tgz"),
    kernelUrl: guestReleaseAsset("rv64-kernel-x86-minimal"),
  }),
  rv64: Object.freeze({
    backendUrl: guestReleaseAsset("rv64.tgz"),
    linuxUrl: guestReleaseAsset("wanix-linux-rv64.tgz"),
    overlayUrl: guestReleaseAsset("wanix-overlay-riscv64.tgz"),
    kernelArchiveUrl: guestReleaseAsset("rv64-kernel-riscv64-minimal.tgz"),
    kernelUrl: guestReleaseAsset("rv64-kernel-riscv64-minimal"),
  }),
});
