// plugins-loading.js — plugin entry-module loading
// (500-line split out of plugins.js).

import { pluginsDep } from "./plugins-deps.js?v=20260829.97";

// --- Loading ---
function entryUrl(entry) {
  if (/^https?:\/\//i.test(entry)) return entry;
  if (entry.startsWith("/")) return entry;
  return null;
}

function vfsPath(entry) {
  if (entry.startsWith("vfs:")) return entry.slice(4);
  return null;
}

// Load the plugin entry module. URL entries import directly (relative
// sub-imports resolve against the URL; bare specifiers use the page
// importmap, so plugins share the shell's React instance). VFS entries
// become blob URLs: single-file only, no relative sub-imports.
export async function loadEntryModule(manifest) {
  const url = entryUrl(manifest.entry, manifest.version);
  if (url) {
    const target = url.includes("?") ? url : `${url}?v=${manifest.version}`;
    return import(target);
  }
  const path = vfsPath(manifest.entry);
  if (path) {
    const root = pluginsDep("getWanixRoot")();
    if (!root) {
      throw new Error("wanix is not ready; cannot read plugin entry");
    }
    const data = await root.readFile(path);
    const blobUrl = URL.createObjectURL(
      new Blob([data], { type: "text/javascript" }),
    );
    try {
      return await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  throw new Error(
    "entry must be an http(s) URL, a /same-origin path, or a vfs:/... path",
  );
}

export function registerFnOf(mod) {
  if (typeof mod?.register === "function") return mod.register;
  if (typeof mod?.plugin?.register === "function") return mod.plugin.register;
  if (typeof mod?.default?.register === "function") {
    return mod.default.register;
  }
  return null;
}
