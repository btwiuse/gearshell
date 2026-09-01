// workspace-vm-mac.js — per-instance MAC allocation for host-kernel VMs
// (500-line split out of workspace-terminal-bridge.js).
//
// The vnet gateway assigns IPs by the guest NIC's MAC (go-netstack's
// IPPool.GetOrAssign keys on the MAC), so every VM instance needs a unique
// L2 address or concurrent guests collide onto one IP. Shares a
// per-page counter so two VMs in one page never collide; reloads reuse
// the same MAC, which the gateway treats as the same host reconnecting.

let vmMacCounter = 0;

export function nextVmMac() {
  const c = 0x10000 + (++vmMacCounter % 0xffff);
  const a = (c >> 8) & 0xff;
  const b = c & 0xff;
  const n = 1 + (vmMacCounter % 0xffffff);
  const o1 = (n >> 16) & 0xff;
  const o2 = (n >> 8) & 0xff;
  const o3 = n & 0xff;
  return [
    "02",
    a.toString(16).padStart(2, "0"),
    b.toString(16).padStart(2, "0"),
    o1.toString(16).padStart(2, "0"),
    o2.toString(16).padStart(2, "0"),
    o3.toString(16).padStart(2, "0"),
  ].join(":");
}
