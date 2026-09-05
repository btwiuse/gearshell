import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const app = readFileSync(new URL("app.js", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("app.css", root), "utf8");
const workbenchExtension = readFileSync(
  new URL("wanix-workbench/dist/web/extension.js", root),
  "utf8",
);

// Pooled corpus: every root-level JS/CSS module plus index.html. The
// 500-line rule keeps splitting app.js into extracted modules, and any
// feature marker may live in any of them, so check the whole source tree
// instead of a hand-maintained module list that drifts on every split.
// Matching is quote-insensitive (checks both ' and ") so markers survive
// refactors that switch string styles.
const rootFiles = readdirSync(root)
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => readFileSync(new URL(f, root), "utf8"));
const pluginFiles = [];
for (const entry of readdirSync(new URL("plugin/", root), { withFileTypes: true })) {
  if (entry.isDirectory()) {
    for (const f of readdirSync(new URL(`plugin/${entry.name}/`, root))) {
      if (/\.(js|css)$/.test(f)) {
        pluginFiles.push(
          readFileSync(new URL(`plugin/${entry.name}/${f}`, root), "utf8"),
        );
      }
    }
  } else if (/\.(js|css)$/.test(entry.name)) {
    pluginFiles.push(
      readFileSync(new URL(`plugin/${entry.name}`, root), "utf8"),
    );
  }
}
const corpusFiles = [...rootFiles, ...pluginFiles].join("\n");
const corpus = `${html}\n${corpusFiles}`;

function has(marker) {
  return corpus.includes(marker) || corpus.includes(marker.replace(/'/g, '"'));
}

// Every plugin stylesheet must be declared in the matching DEFAULT_PLUGINS
// css field, or it silently never loads (the loader only fetches what the
// manifest declares). Check both directions: files on disk -> declared,
// declared -> exists. Manifest modules are split (500-line rule), so the
// corpus is every app-plugin-manifests*.js concatenated.
const manifestsSrc = readdirSync(root, { withFileTypes: true })
  .filter((entry) =>
    entry.isFile() && /^app-plugin-manifests(-[a-z0-9-]+)?\.js$/.test(entry.name)
  )
  .map((entry) => readFileSync(new URL(entry.name, root), "utf8"))
  .join("\n");
for (const entry of readdirSync(new URL("plugin/", root), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = new URL(`plugin/${entry.name}/`, root);
  // Iframe plugins are self-contained apps: the page links its own
  // stylesheet, so a manifest css: entry is neither needed nor wanted
  // (it would inject the page's body-level rules into the SHELL chrome).
  // Detect them by whether the plugin's manifest block declares iframe:.
  const idStart = manifestsSrc.indexOf(`id: "${entry.name}"`);
  const idEnd = idStart < 0
    ? -1
    : manifestsSrc.indexOf(`\n  {\n`, idStart + 6);
  const block = idStart < 0
    ? ""
    : manifestsSrc.slice(idStart, idEnd < 0 ? undefined : idEnd);
  const isIframePlugin = block.includes("iframe: {");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".css")) continue;
    const path = `/plugin/${entry.name}/${f}`;
    if (isIframePlugin) continue;
    if (!manifestsSrc.includes(`"${path}"`)) {
      throw new Error(
        `Plugin stylesheet ${path} is not declared in DEFAULT_PLUGINS css`,
      );
    }
  }
}
for (const m of manifestsSrc.matchAll(/"(\/plugin\/[^"]+\.css)"/g)) {
  try {
    readFileSync(new URL(`.${m[1]}`, root), "utf8");
  } catch {
    throw new Error(`DEFAULT_PLUGINS css declares ${m[1]} but the file is missing`);
  }
}

// Plugin `files` declarations (js-worker scripts, wasi modules, any fetched
// resource mounted into task namespaces) must point at files that exist.
for (const m of manifestsSrc.matchAll(/src:\s*"(\/[^"]+)"/g)) {
  const src = m[1];
  if (!src.startsWith("/examples/") && !src.startsWith("/plugin/")) continue;
  try {
    readFileSync(new URL(`.${src}`, root), "utf8");
  } catch {
    throw new Error(`DEFAULT_PLUGINS files declares ${src} but the file is missing`);
  }
}

const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
  input: app,
  encoding: "utf8",
});
if (syntax.status !== 0) {
  throw new Error(syntax.stderr || "app.js syntax check failed");
}

for (
  const marker of [
    "FilesPanel",
    "RuntimePanel",
    "LandingPanel",
    "WorkbenchPanel",
    'id: "deck"',
    'src: "/plugin/deck/index.html"',
    "component: 'workbench'",
    'value="import"',
    'data-system="allow-origins"',
  ]
) {
  if (!has(marker)) {
    throw new Error(`Missing expected feature marker: ${marker}`);
  }
}
if (!has("term=\"\"\n      raw=\"\"")) {
  throw new Error("Workbench terminals must forward raw input.");
}
if (!has("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'")) {
  throw new Error("Workbench must default to the bundled static assets.");
}
if (!has("LEGACY_DEFAULT_WORKBENCH_ASSETS_URL")) {
  throw new Error(
    "Legacy Workbench asset defaults must migrate to the bundled assets.",
  );
}
if (!has("isLegacyWanixRuntimeUrl")) {
  throw new Error(
    "Workspaces pinning the Wanix runtime to commit hashes or @main must migrate to the current v<semver> release.",
  );
}
if (!has("panel.id.startsWith('workbench-')")) {
  throw new Error(
    "GearShell must focus the existing singleton Workbench panel.",
  );
}
if (!has("window.dispatchEvent(new Event('resize'))")) {
  throw new Error("Workbench panels must forward Dockview resize events.");
}
if (!has("DEFAULT_COLLAPSED_LAUNCHER_ITEMS")) {
  throw new Error("Launcher needs configurable default collapsed items.");
}
if (!has("launcher-more-toggle")) {
  throw new Error("Launcher needs a More control for collapsed items.");
}
if (!has("DEFAULT_LAUNCHER_ITEM_ORDER") || !has("normalizeLauncherOrder")) {
  throw new Error("Launcher must persist a complete item order.");
}
if (!has("data-config-launcher-order")) {
  throw new Error("Settings must expose Launcher item ordering.");
}
if (!has("function LauncherOrderEditor")) {
  throw new Error(
    "Launcher layout must combine ordering and visibility controls.",
  );
}
if (!has("setCollapsed")) {
  throw new Error(
    "Launcher layout must combine ordering and visibility controls.",
  );
}
if (!has("onDragStart:") || !has("EyeOff") || !has("Open by default")) {
  throw new Error(
    "Launcher layout must support drag, visibility icons, and default startup.",
  );
}
if (!has('src: "/plugin/bonsai/buildless.html"') || !has('name: "Bonsai 27B"')) {
  throw new Error(
    "Launcher must offer Bonsai 27B from the bundled Bonsai app.",
  );
}
if (!has("DEFAULT_LAUNCHER_ITEM_ORDER") || !has("'bonsai'")) {
  throw new Error("Launcher layout must include Bonsai 27B.");
}
if (!has('import("../../web-pet/index.js")')) {
  throw new Error("Wagi Dog must use the bundled web-pet runtime.");
}
if (!has("new WebPetRef.current()")) {
  throw new Error("GearShell must start the Wagi Dog web pet when enabled.");
}
if (!has('href="web-pet/web-pet.css"')) {
  throw new Error("GearShell must load the web-pet stylesheet.");
}
if (!has("wagiDogEnabled: config?.wagiDogEnabled === true")) {
  throw new Error("Wagi Dog must default to disabled for existing workspaces.");
}
if (!has('data-config="wagi-dog-enabled"')) {
  throw new Error("Settings must expose the Wagi Dog toggle.");
}
if (!has("aria-checked=${wagiDogEnabled}")) {
  throw new Error("The panel menu must expose the Wagi Dog toggle.");
}
if (!has("TERMINAL_PRESET_ICON_OPTIONS")) {
  throw new Error("Terminal presets need configurable Lucide icons.");
}
if (!has("data-terminal-profile-editor")) {
  throw new Error("Settings must expose the Terminal preset editor.");
}
if (!has("icons as LucideIcons") || !has("Object.entries(LucideIcons)")) {
  throw new Error(
    "Terminal preset icons must cover the complete Lucide catalog.",
  );
}
if (!has("TerminalPresetIconPicker") || !has("terminal-profile-icon-catalog")) {
  throw new Error("Terminal preset icons need a searchable catalog.");
}
if (!has("repeat(auto-fill, minmax(78px, 1fr))")) {
  throw new Error("Terminal preset icon grid must be responsive.");
}
if (
  !has("terminalProfileOrder") || !has("function normalizeTerminalProfileOrder")
) throw new Error("Terminal presets need persisted ordering.");
if (!has("terminal-profile-handle") || !has("onDragStart:")) {
  throw new Error("Terminal presets need drag reorder controls.");
}
if (!has("wanix-extras@v0.4.0-rc3/v86.tgz")) {
  throw new Error(
    "VM bridge sessions must fall back to the public v86 archive.",
  );
}
if (!has("Workbench assets URL or path")) {
  throw new Error("Workbench asset settings must accept local paths.");
}
if (!html.match(/src="app\.js"/)) {
  throw new Error("index.html must load app.js");
}
if (!has(".files-panel") || !has(".runtime-panel")) {
  throw new Error("Missing panel styles");
}
if (!has("FilesBreadcrumb")) {
  throw new Error("Files panel must expose the clickable path breadcrumb.");
}
if (!has("FilesContextMenu")) {
  throw new Error("Files panel must offer the right-click context menu.");
}
if (!has("onResizeBy")) {
  throw new Error("Files sidebar resizer must support keyboard resizing.");
}
if (!has("FavoritesSidebar") || !has("defaultFavorites")) {
  throw new Error("Files panel must offer a Favorites sidebar with defaults.");
}
if (!has("useFilesTree") || !has("TREE_ROOT") || !has("files-tree-node")) {
  throw new Error("Files panel must provide an expandable hierarchy tree.");
}
if (!has('preview.kind === "pdf"') || !has('title="PDF preview"')) {
  throw new Error("PDF preview must render in an iframe, never as a video.");
}
if (
  !css.includes(
    ".workbench-session .explorer-folders-view .monaco-icon-label::before",
  )
) throw new Error("Missing scoped Workbench file icon spacing fix.");
if (
  !css.includes(
    ".monaco-tl-twistie + .monaco-tl-contents > .monaco-icon-label.folder-icon",
  )
) throw new Error("Missing scoped Workbench folder label spacing fix.");
if (
  !css.includes(
    '.monaco-list-row[aria-level]:not([aria-level="1"]) .monaco-tl-twistie',
  ) || !css.includes("translateX(5px)")
) {
  throw new Error(
    "Nested Workbench tree controls must clear their indent guides.",
  );
}
if (
  !css.includes(
    '.monaco-list-row[aria-level]:not([aria-level="1"]) .indent-guide',
  ) || !css.includes("translateX(-4px)")
) {
  throw new Error(
    "Nested Workbench indent guides must remain offset from child controls.",
  );
}
if (css.includes(".workbench-session .monaco-tl-twistie")) {
  throw new Error("GearShell must not override Workbench disclosure geometry.");
}
if (!workbenchExtension.includes("bind #task/self/term/winch winch")) {
  throw new Error(
    "Workbench terminals must mount their resize signal through the task namespace.",
  );
}
if (!workbenchExtension.includes("setDimensions: async (dimensions")) {
  throw new Error("Workbench terminals must forward VS Code resize events.");
}
if (!has("window.GearShell")) {
  throw new Error(
    "Workspace API must be exposed to agents via window.GearShell (jsfs /js bridge).",
  );
}
if (!has("initWorkspaceApi") || !has("GEAR_BIND")) {
  throw new Error(
    "Workspace API boot hook and gear bind must exist for agent-side control.",
  );
}
// ?v= cache-bust tokens are retired: modules are unversioned and rely
// on HTTP cache headers / DevTools "Disable cache" during iteration.
// Guard against reintroduction — a single stray token on one importer
// would split the module into two instances and break DI state.
if (corpus.includes("?v=")) {
  throw new Error(
    "?v= tokens are retired; remove them (rely on cache headers / Disable cache).",
  );
}

// 500-line / 50-line rules (AGENTS.md): walk the first-party JS tree
// (root + plugin/, excluding submodules and node_modules) and fail on
// any file over 500 lines or any function/method/arrow block over 50.
const RULE_IGNORE_DIRS = new Set([
  "browser",
  "isolation",
  "wanix-workbench",
  "bonsai",
  "web-pet",
  "memory",
  "vendor",
  ".git",
  "node_modules",
  "dist",
]);
function firstPartyJsFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!RULE_IGNORE_DIRS.has(e.name)) walk(`${dir}${e.name}/`);
      } else if (
        e.isFile() && e.name.endsWith(".js") &&
        !e.name.endsWith(".min.js") && !e.name.endsWith(".sw.js") &&
        !e.name.endsWith(".bundle.js")
      ) {
        out.push(new URL(`${dir}${e.name}`, root));
      }
    }
  };
  walk("");
  return out;
}
const FN_HEAD_RE = /\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/g;
const ARROW_BODY_RE = /=>\s*\{/g;
const METHOD_HEAD_RE = /^\s*(?:async\s+)?\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "with"]);
function assertBodyWithinLimit(src, headIndex, name, label, file) {
  const i = src.indexOf("{", headIndex);
  if (i < 0) return;
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (j >= src.length) return;
  const startLine = src.slice(0, headIndex).split("\n").length;
  const endLine = src.slice(0, j + 1).split("\n").length;
  if (endLine - startLine + 1 > 50) {
    throw new Error(
      `${file}:${startLine} ${label} "${name || "(anonymous)"}" is over 50 lines`,
    );
  }
}
for (const fileUrl of firstPartyJsFiles()) {
  const src = readFileSync(fileUrl, "utf8");
  const file = fileUrl.pathname.replace(root.pathname, "");
  if (src.split("\n").length > 500) {
    throw new Error(`${file} is over 500 lines; split it`);
  }
  let m;
  FN_HEAD_RE.lastIndex = 0;
  while ((m = FN_HEAD_RE.exec(src)) !== null) {
    assertBodyWithinLimit(src, m.index, m[1], "function", file);
    FN_HEAD_RE.lastIndex = m.index + 1;
  }
  ARROW_BODY_RE.lastIndex = 0;
  while ((m = ARROW_BODY_RE.exec(src)) !== null) {
    assertBodyWithinLimit(src, m.index, "", "arrow", file);
    ARROW_BODY_RE.lastIndex = m.index + 1;
  }
  METHOD_HEAD_RE.lastIndex = 0;
  while ((m = METHOD_HEAD_RE.exec(src)) !== null) {
    if (!CONTROL_KEYWORDS.has(m[1])) {
      assertBodyWithinLimit(src, m.index, m[1], "method", file);
    }
    METHOD_HEAD_RE.lastIndex = m.index + 1;
  }
}

console.log("Static verification passed.");
