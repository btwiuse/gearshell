// app-normalize-runtime.js — wanix runtime config normalization
// (500-line split out of app-normalize.js).

import { WANIX_RUNTIME } from "./app-constants.js";

const WANIX_RUNTIME_SEMVER = /^v\d+\.\d+\.\d+/;
const LEGACY_WANIX_KERNEL_WASM = "v0.4.0";
// Local-directory mounting needs the "localdir" bind type added in v0.4.11;
// workspaces saved against older pins hit an unknown-type rejection instead.
const MIN_LOCALDIR_RUNTIME = [0, 4, 11];

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
    return kind === "wasm" &&
      (ref === LEGACY_WANIX_KERNEL_WASM ||
        isOlderThan(ref, MIN_LOCALDIR_RUNTIME));
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
    // No override (or already the packaged default): load the default pair,
    // keeping a configured wasm that points at the same module.
    return { moduleUrl, wasmUrl: configuredWasm || wasmUrl };
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
