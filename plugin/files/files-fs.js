// files-fs.js — the Files panel's filesystem surface.
//
// Files panel modules (tree / editor / context-menu / refresh) all
// go through `getFs()` instead of the wanix root handle. Today
// `getFs()` is a thin wrapper around `GearShell.fs.*`; the same
// shape will be exposed inside an iframe plugin later, where every
// call here is one postMessage round-trip to the host. Keeping a
// single entry point makes the eventual iframe migration a wiring
// change here, not a sweep across the panel.
//
// All methods are async and resolve on the same shape regardless of
// caller location:
//   readDir(path)          -> [{ name, isDirectory }, ...]
//   readFile(path)         -> Uint8Array
//   readFileText(path)     -> string
//   writeFile(path, bytes) -> void
//   writeFileText(p, text) -> void
//   stat(path)             -> { path, size, mode, isDirectory,
//                                isFile, modTime } | null
//   mkdir(path)            -> void
//   rm(path)               -> void
//   rename(path, nextPath) -> void
//   exists(path)           -> boolean (best-effort; not authoritative)
//
// Errors propagate as plain Error objects with the wanix message, so
// callers can show "ENOENT" / "permission denied" verbatim. The kernel
// is the only thing that knows what's actually mounted, so we never
// try to second-guess it from the panel.

// Resolves the GearShell API object from whatever context the panel
// is running in. The host (where the panel currently lives) has it
// on `window.GearShell`; an iframe plugin would inject the bridge
// here too, but for v1 we only support in-page.
function resolveGearShell() {
  try {
    if (typeof window !== "undefined" && window.GearShell?.fs) {
      return window.GearShell;
    }
  } catch {
    // SSR / non-browser; fall through to the explicit error.
  }
  throw new Error(
    "files-fs: GearShell.fs is not available (kernel not ready?)",
  );
}

function requireString(path, name) {
  if (typeof path !== "string" || !path) {
    throw new Error(`files-fs: ${name} requires a non-empty path`);
  }
  return path;
}

export async function readDir(path) {
  requireString(path, "readDir");
  const list = await resolveGearShell().fs.readDir(path);
  return Array.isArray(list) ? list : [];
}

export async function readFile(path) {
  requireString(path, "readFile");
  const bytes = await resolveGearShell().fs.readFile(path);
  return bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes || []);
}

export async function readFileText(path) {
  requireString(path, "readFileText");
  return resolveGearShell().fs.readFileText(path);
}

export async function writeFile(path, contents) {
  requireString(path, "writeFile");
  const bytes = contents instanceof Uint8Array
    ? contents
    : new Uint8Array(contents || []);
  await resolveGearShell().fs.writeFile(path, bytes);
}

export async function writeFileText(path, text) {
  requireString(path, "writeFileText");
  await resolveGearShell().fs.writeFileText(path, String(text ?? ""));
}

export async function stat(path) {
  requireString(path, "stat");
  return resolveGearShell().fs.stat(path);
}

export async function mkdir(path) {
  requireString(path, "mkdir");
  await resolveGearShell().fs.mkdir(path);
}

export async function rm(path) {
  requireString(path, "rm");
  await resolveGearShell().fs.rm(path);
}

export async function rename(path, nextPath) {
  requireString(path, "rename");
  requireString(nextPath, "rename");
  await resolveGearShell().fs.rename(path, nextPath);
}

export async function exists(path) {
  requireString(path, "exists");
  try {
    return Boolean(await resolveGearShell().fs.exists(path));
  } catch {
    return false;
  }
}

// A single accessor the panel stores once and passes around as
// `fs`. Mirrors the `getFs()` accessor the panel already uses, so
// callers swap the variable name but the call sites stay identical.
export function getFs() {
  return {
    readDir,
    readFile,
    readFileText,
    writeFile,
    writeFileText,
    stat,
    mkdir,
    rm,
    rename,
    exists,
  };
}