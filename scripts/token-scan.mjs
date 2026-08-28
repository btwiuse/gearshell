import fs from "node:fs";
const files = [
  "app-shell.js",
  "app.js",
  "workspace-open-api.js",
  "workspace-tasks-api.js",
  "workspace-config-api.js",
  "gctl-bind.js",
  "workspace-task-registry.js",
  "workspace-agents-api.js",
  "files-editor-pane.js",
  "files-parts.js",
  "files.js",
  "panels.js",
];
const mods = [
  "app-panels-store",
  "app-state",
  "app-workspace",
  "app-normalize-system",
  "app-workspace-task-sessions",
  "app-constants",
  "files",
  "files-info",
  "panels",
  "app-sessions",
  "app-shell",
  "crush-install",
];
for (const m of mods) {
  const esc = m.replace(/\./g, "\\.");
  const re = new RegExp(
    "(?<![A-Za-z0-9_.-])" + esc + "\\.js\\?v=([0-9.]+)",
    "g",
  );
  const seen = new Map();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const match of src.matchAll(re)) {
      const by = seen.get(match[1]) || [];
      by.push(f);
      seen.set(match[1], by);
    }
  }
  if (seen.size > 1) {
    console.log("SPLIT " + m + ":");
    for (const [tok, fsList] of seen) {
      console.log("   " + tok + " <- " + fsList.join(", "));
    }
  } else if (seen.size === 1) {
    console.log("ok    " + m + " @ " + [...seen.keys()][0]);
  }
}
