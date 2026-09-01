// plugin/vm/vm-config.js — the VM panel's plugin-owned asset constants.
//
// The VM panel's guest image and emulator backend are plugin configuration,
// not system constants: they belong to this plugin and are re-exported by the
// host only as deprecated defaults so older config snapshots and the
// normalize pass keep working untouched. The v86 plugin overrides the backend
// with its own archive; the rv64 guest uses a separate RISC-V image built by
// rv64.js (wanix-linux-rv64.tgz), so these x86 values never apply to rv64.
//
// URL scheme differs intentionally — the backend ships as a GitHub release
// archive and the guest image ships on npm — and the two tags (v0.4.0-rc3 /
// 0.4.0-rc2) are their own latest versions, not a stale/new pair of the same
// artifact.

export const VM_BACKEND_URL =
  "https://cdn.jsdelivr.net/gh/btwiuse/wanix-extras@v0.4.0-rc3/v86.tgz";
export const VM_LINUX_URL =
  "https://cdn.jsdelivr.net/npm/wanix-extras@0.4.0-rc2/dist/wanix-linux.tgz";
