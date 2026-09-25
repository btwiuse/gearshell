// app-normalize-runtime.js — wanix runtime config normalization
// (500-line split out of app-normalize.js).

import { WANIX_RUNTIME } from "./app-constants.js";

const WANIX_RUNTIME_SEMVER = /^v\d+\.\d+\.\d+/;
const LEGACY_WANIX_KERNEL_WASM = "v0.4.0";
const MIN_SUPPORTED_WANIX_RUNTIME = [0, 4, 58];

function semverParts(ref) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(ref);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isOlderThan(ref, min) {
  const parts = semverParts(ref);
  if (!parts) return false;
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== min[i]) return parts[i] < min[i];
  }
  return false;
}

export function isLegacyWanixRuntimeUrl(url, kind) {
  if (typeof url !== "string" || !url.includes("justwasm/wanix")) {
    return false;
  }
  const ref = url.slice(url.lastIndexOf("@") + 1);
  if (WANIX_RUNTIME_SEMVER.test(ref)) {
    return ref === LEGACY_WANIX_KERNEL_WASM ||
      isOlderThan(ref, MIN_SUPPORTED_WANIX_RUNTIME);
  }
  return true; // commit hashes, @main, or any other floating ref
}

export function normalizeRuntimeConfig(runtime = {}) {
  const configured = runtime && typeof runtime === "object" ? runtime : {};
  const wasmUrl = isLegacyWanixRuntimeUrl(configured.wasmUrl, "wasm")
    ? WANIX_RUNTIME.wasmUrl
    : configured.wasmUrl;
  const moduleUrl = isLegacyWanixRuntimeUrl(configured.moduleUrl, "module")
    ? WANIX_RUNTIME.moduleUrl
    : configured.moduleUrl;
  return {
    ...WANIX_RUNTIME,
    ...configured,
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(moduleUrl ? { moduleUrl } : {}),
  };
}

// Resolve the effective wanix runtime pair for this boot. Workspaces saved
// on other devices persist their own moduleUrl/wasmUrl (often an older tag);
// a stale or broken override must never prevent the system from loading.
// The configured module is probed first; on failure the packaged default
// pair is used instead. The pair always falls back together so the module
// and the wasm stay on the same wanix version.
export async function resolveWanixRuntime(runtime = {}) {
  const configured = runtime && typeof runtime === "object" ? runtime : {};
  const { moduleUrl, wasmUrl } = WANIX_RUNTIME;
  const configuredModule = configured.moduleUrl;
  const configuredWasm = configured.wasmUrl;
  if (!configuredModule || configuredModule === moduleUrl) {
    return { moduleUrl, wasmUrl: configuredWasm || wasmUrl };
  }
  if (isLegacyWanixRuntimeUrl(configuredModule, "module") ||
      isLegacyWanixRuntimeUrl(configuredWasm, "wasm")) {
    return { moduleUrl, wasmUrl };
  }
  try {
    await import(configuredModule);
  } catch (error) {
    console.warn(
      "[wanix] configured runtime module failed to load; falling back to the packaged default.",
      configuredModule,
      error,
    );
    return { moduleUrl, wasmUrl };
  }
  return { moduleUrl: configuredModule, wasmUrl: configuredWasm || wasmUrl };
}
