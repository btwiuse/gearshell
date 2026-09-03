// files-path.js — filesystem path helpers shared across the Files
// panel modules, plus the bounded stat enrichment used by the info pane
// to sort by size / modified time. Split out of files-parts.js when
// that module crossed the 500-line rule.

// === Path helpers (shared by the panel and the mount sidebar) ===

export function normalizeFilesystemPath(path = ".") {
  const parts = [];
  for (const part of String(path).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/") || ".";
}

export function filesystemPathJoin(base, name) {
  if (base.startsWith("/")) {
    return `${base.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
  }
  return normalizeFilesystemPath(base === "." ? name : `${base}/${name}`);
}

export function filesystemPathParent(path) {
  const parts = normalizeFilesystemPath(path).split("/").filter((part) =>
    part && part !== "."
  );
  parts.pop();
  return parts.join("/") || ".";
}

// === Entry stats enrichment ===
// readDir returns bare names, so the listing entries carry no size or
// modified time. Stat them (bounded and timeboxed, like the wasm
// sniffer) so the info pane can sort by size / modified without hanging
// on namespace mirrors whose reads never resolve.
//
// `getFs()` resolves the Files panel's filesystem surface (the
// GearShell.fs wrapper — see plugin/files/files-fs.js). The stat
// payload is already normalised to snake_case by the wrapper, so this
// module does not depend on the wanix Go-shaped field names any more.
export function enrichEntryStats(getFs, basePath, entries, {
  limit = Infinity,
  timeoutMs = 400,
} = {}) {
  if (!entries || entries.length === 0) return Promise.resolve(entries);
  const targets = entries.slice(0, limit).filter((entry) => !entry.isDirectory);
  const fs = getFs();
  return Promise.all(targets.map((entry) =>
    Promise.race([
      fs.stat(filesystemPathJoin(basePath, entry.name)),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]).then((stat) => {
      if (stat) {
        if (stat.size != null) entry.size = stat.size;
        if (stat.modTime != null) entry.modTime = stat.modTime;
      }
    }).catch(() => {})
  )).then(() => entries);
}
