// workspace-fs-api.js — host-side implementation of the GearShell.fs
// namespace exposed to iframe plugins and the in-page API.
//
// Each method is a thin wrapper around the wanix root's VFS calls
// (readFile / writeFile / readDir / stat / makeDir / remove). The
// wanix kernel is the same one the Files panel uses, so an iframe
// plugin that does `GearShell.fs.readText("/opfs/home/foo.txt")`
// reads the same bytes the Files panel would show when it navigates
// there. Paths follow the wanix namespace syntax (see
// plugin/crush-playground/kv-api.js for a contrasting per-workspace
// store) — strings like ".", "task", "#task/repl-1/term/data",
// "/opfs/home", or any bind-mounted subtree.
//
// The readFile / writeFile payloads are JSON-serialisable Uint8Array
// (serialised through JSON.stringify base64-style byte round-trips).
// Text helpers readFileText / writeFileText accept and return plain
// strings, doing the TextEncoder / TextDecoder work in place so the
// plugin doesn't have to import the codecs.
//
// Iframe plugins opt in via the `fs.*` permission path; permissions
// are enforced by the existing permitsPath whitelist in
// plugins-iframe-api.js. Path sandboxing is left to the wanix
// namespace layout — the kernel's bind graph determines what a
// given mount is allowed to read or write.

import { getWanixRoot } from "./app-state.js";

function getRoot() {
  try {
    return getWanixRoot();
  } catch (error) {
    return { __error: error?.message || String(error) };
  }
}

function requireRoot() {
  const root = getRoot();
  if (root && root.__error) throw new Error(root.__error);
  if (!root) throw new Error("wanix system is not ready");
  return root;
}

function requirePath(path) {
  if (typeof path !== "string" || !path) {
    throw new Error("path must be a non-empty string");
  }
  return path;
}

function toUint8Array(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("writeFile payload must be Uint8Array or array of bytes");
}

// Read the full contents of `path` as a Uint8Array. Resolves with the
// bytes the wanix kernel returned; rejects with the kernel's error
// message on ENOENT, EACCES, etc. The iframe bridge carries the
// Uint8Array across postMessage unchanged (structured-clone), so the
// plugin side receives a real Uint8Array without any JSON wrapping.
async function readFile(path) {
  requirePath(path);
  const root = requireRoot();
  return await root.readFile(path);
}

async function readFileText(path) {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes || new Uint8Array(0));
}

// Write `contents` (Uint8Array, plain Array<number>, or ArrayBuffer)
// to `path`, truncating any existing file. wanix's writeFile helper
// performs the chmod that the signalfs rejects, so the kernel uses
// the openWritable / writer.close pair on the term device but the
// VFS writeFile path is safe for ordinary files.
async function writeFile(path, contents) {
  requirePath(path);
  const root = requireRoot();
  const bytes = toUint8Array(contents);
  await root.writeFile(path, bytes);
  return { ok: true, path, bytes: bytes.byteLength };
}

async function writeFileText(path, text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  return writeFile(path, bytes);
}

// List the immediate children of `path`. wanix readDir returns bare
// names with directories marked by a trailing slash; we normalise to
// { name, isDirectory } so the iframe side gets a stable shape
// without having to know about the slash convention.
async function readDir(path) {
  requirePath(path);
  const root = requireRoot();
  const rawNames = await root.readDir(path);
  const names = Array.isArray(rawNames) ? rawNames : [];
  return names.map((name) => {
    const isDirectory = name.endsWith("/");
    return { name: isDirectory ? name.slice(0, -1) : name, isDirectory };
  });
}

async function stat(path) {
  requirePath(path);
  const root = requireRoot();
  const info = await root.stat(path);
  // wanix returns Go-style field names (Size, Mode, IsDir, ModTime
  // in unix seconds). Normalise to snake_case for the plugin side
  // and surface a friendlier top-level isDirectory flag.
  if (!info || typeof info !== "object") return null;
  return {
    path,
    size: typeof info.Size === "number" ? info.Size : null,
    mode: typeof info.Mode === "number" ? info.Mode : null,
    isDirectory: Boolean(info.IsDir),
    isFile: info.IsDir === false,
    modTime: typeof info.ModTime === "number" ? info.ModTime : null,
    raw: info,
  };
}

async function mkdir(path) {
  requirePath(path);
  const root = requireRoot();
  await root.makeDir(path);
  return { ok: true, path };
}

async function rm(path) {
  requirePath(path);
  const root = requireRoot();
  await root.remove(path);
  return { ok: true, path };
}

// exists() is a stat wrapper that resolves { ok, exists } rather
// than throwing — most callers want the boolean, not a try/catch.
// Returns { ok: false } if the wanix root isn't ready yet so the
// plugin can distinguish a real ENOENT from "kernel not booted".
async function exists(path) {
  try {
    requirePath(path);
    const root = requireRoot();
    await root.stat(path);
    return { ok: true, path, exists: true };
  } catch (error) {
    const message = error?.message || String(error);
    // wanix surfaces ENOENT-style failures with messages like
    // "file does not exist", "no such file or directory", or
    // ENOENT. Match the common shapes so a real ENOENT becomes
    // { exists: false } rather than throwing. Real I/O errors
    // (permission denied, kernel panic, invalid argument) still
    // bubble up — callers who care about the difference can call
    // stat() directly and read the thrown message.
    if (/does not exist|no such|enoent|not found/i.test(message)) {
      return { ok: true, path, exists: false };
    }
    throw error;
  }
}

export const fsApi = {
  readFile,
  readFileText,
  writeFile,
  writeFileText,
  readDir,
  stat,
  exists,
  mkdir,
  rm,
};