// files-info.js — shared formatting/sorting helpers for the Files info
// pane. The pane's React tree lives in files-info-pane.js (component)
// and files-info-pane-body.js (renderers); this module re-exports the
// pane so files-editor-pane.js keeps a single stable surface.
export { FilesInfoPane } from "./files-info-pane.js?v=20260826.42";

export function formatFileSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = "KB";
  for (const next of units) {
    if (value < 1024 || next === "TB") {
      unit = next;
      break;
    }
    value /= 1024;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

export function formatModTime(value) {
  if (!value) return "—";
  const ms = typeof value === "number" && value < 1e12
    ? value * 1000
    : new Date(value).getTime();
  return new Date(ms).toLocaleString();
}

// Column formatter for list rows: fixed-width YYYY-MM-DD hh:mm:ss so
// the modified column stays aligned and unambiguous.
export function formatModTimeColumn(value) {
  if (!value) return "";
  const ms = typeof value === "number" && value < 1e12
    ? value * 1000
    : new Date(value).getTime();
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Sort the children shown in the info pane: directories stay grouped
// first (Explorer-style), then entries sort by the chosen key. Missing
// size / modified values always sink to the end so partial data does
// not scramble the order.
export function sortFilesEntries(children, { by = "name", desc = false } = {}) {
  if (!children) return children;
  const factor = desc ? -1 : 1;
  const key = by === "size" ? "size" : by === "modified" ? "modTime" : "name";
  return [...children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const av = a[key];
    const bv = b[key];
    if (av == null || bv == null) {
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      return av == null ? 1 : -1;
    }
    const cmp = key === "name" ? String(av).localeCompare(String(bv)) : av - bv;
    return factor * cmp;
  });
}
