import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('app.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('app.css', root), 'utf8');
const workbenchExtension = readFileSync(new URL('wanix-workbench/dist/web/extension.js', root), 'utf8');

// Pooled corpus: every root-level JS/CSS module plus index.html. The
// 500-line rule keeps splitting app.js into extracted modules, and any
// feature marker may live in any of them, so check the whole source tree
// instead of a hand-maintained module list that drifts on every split.
// Matching is quote-insensitive (checks both ' and ") so markers survive
// refactors that switch string styles.
const corpusFiles = readdirSync(root)
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => readFileSync(new URL(f, root), 'utf8'))
  .join('\n');
const corpus = `${html}\n${corpusFiles}`;

function has(marker) {
  return corpus.includes(marker) || corpus.includes(marker.replace(/'/g, '"'));
}

const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: app, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(syntax.stderr || 'app.js syntax check failed');

for (const marker of ['FilesPanel', 'RuntimePanel', 'LandingPanel', 'DeckPanel', 'WorkbenchPanel', 'VmPanel', "component: 'deck'", "component: 'workbench'", "component: 'vm'", 'value="import"', 'data-system="allow-origins"']) {
  if (!has(marker)) throw new Error(`Missing expected feature marker: ${marker}`);
}
if (!has("workbench.setAttribute('raw', '')")) throw new Error('Workbench terminals must forward raw input.');
if (!has("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'")) throw new Error('Workbench must default to the bundled static assets.');
if (!has('LEGACY_DEFAULT_WORKBENCH_ASSETS_URL')) throw new Error('Legacy Workbench asset defaults must migrate to the bundled assets.');
if (!has('isLegacyWanixRuntimeUrl')) throw new Error('Workspaces pinning the Wanix runtime to commit hashes or @main must migrate to the current v<semver> release.');
if (!has("panel.id.startsWith('workbench-')")) throw new Error('GearShell must focus the existing singleton Workbench panel.');
if (!has("window.dispatchEvent(new Event('resize'))")) throw new Error('Workbench panels must forward Dockview resize events.');
if (!has("vm.setAttribute('netdev', session.config.netdev)")) throw new Error('VM panels must forward their saved network configuration.');
if (!has('DEFAULT_COLLAPSED_LAUNCHER_ITEMS')) throw new Error('Launcher needs configurable default collapsed items.');
if (!has('launcher-more-toggle')) throw new Error('Launcher needs a More control for collapsed items.');
if (!has('DEFAULT_LAUNCHER_ITEM_ORDER') || !has('normalizeLauncherOrder')) throw new Error('Launcher must persist a complete item order.');
if (!has('data-config-launcher-order')) throw new Error('Settings must expose Launcher item ordering.');
if (!has('function LauncherOrderEditor')) throw new Error('Launcher layout must combine ordering and visibility controls.');
if (!has('setCollapsed')) throw new Error('Launcher layout must combine ordering and visibility controls.');
if (!has('onDragStart:') || !has('EyeOff') || !has('Open by default')) throw new Error('Launcher layout must support drag, visibility icons, and default startup.');
if (!has("src: '/bonsai/'") || !has("label: 'Bonsai 27B'")) throw new Error('Launcher must offer Bonsai 27B from the bundled Bonsai app.');
if (!has('DEFAULT_LAUNCHER_ITEM_ORDER') || !has("'bonsai'")) throw new Error('Launcher layout must include Bonsai 27B.');
if (!has("import('./web-pet/index.js')")) throw new Error('Wagi Dog must use the bundled web-pet runtime.');
if (!has('new WebPetRef.current()')) throw new Error('GearShell must start the Wagi Dog web pet when enabled.');
if (!has('href="web-pet/web-pet.css"')) throw new Error('GearShell must load the web-pet stylesheet.');
if (!has('wagiDogEnabled: config?.wagiDogEnabled === true')) throw new Error('Wagi Dog must default to disabled for existing workspaces.');
if (!has('data-config="wagi-dog-enabled"')) throw new Error('Settings must expose the Wagi Dog toggle.');
if (!has("'aria-checked': wagiDogEnabled")) throw new Error('The panel menu must expose the Wagi Dog toggle.');
if (!has('TERMINAL_PRESET_ICON_OPTIONS')) throw new Error('Terminal presets need configurable Lucide icons.');
if (!has('data-terminal-profile-editor')) throw new Error('Settings must expose the Terminal preset editor.');
if (!has('icons as LucideIcons') || !has('Object.entries(LucideIcons)')) throw new Error('Terminal preset icons must cover the complete Lucide catalog.');
if (!has('TerminalPresetIconPicker') || !has('terminal-profile-icon-catalog')) throw new Error('Terminal preset icons need a searchable catalog.');
if (!has('repeat(auto-fill, minmax(78px, 1fr))')) throw new Error('Terminal preset icon grid must be responsive.');
if (!has('terminalProfileOrder') || !has('function normalizeTerminalProfileOrder')) throw new Error('Terminal presets need persisted ordering.');
if (!has('terminal-profile-handle') || !has('onDragStart:')) throw new Error('Terminal presets need drag reorder controls.');
if (!has("user,type=virtio,relay_url=${wispUrl}")) throw new Error('VM settings must derive v86\'s native Wisp relay argument.');
if (!has("user,type=virtio,relay_url=fetch")) throw new Error('VM settings must derive v86\'s native fetch relay argument.');
if (!has('data-config-value="vmWispUrl"')) throw new Error('Settings must expose the Wisp server URL.');
if (!has('wanix-extras@0.4.0-rc2/dist/v86.tgz')) throw new Error('VMs must default to the public v86 archive with built-in Wisp support.');
if (!has('isLegacyVmBackendUrl')) throw new Error('Workspaces pinned to the commit-hash custom v86 archive must migrate to the semver-pinned public archive.');
if (!has('Workbench assets URL or path')) throw new Error('Workbench asset settings must accept local paths.');
if (!html.match(/src="app\.js\?v=[\d.]+"/)) throw new Error('index.html must cache-bust app.js');
if (!has('.files-panel') || !has('.runtime-panel')) throw new Error('Missing panel styles');
if (!has('FilesBreadcrumb')) throw new Error('Files panel must expose the clickable path breadcrumb.');
if (!has('FilesContextMenu')) throw new Error('Files panel must offer the right-click context menu.');
if (!has('onResizeBy')) throw new Error('Files sidebar resizer must support keyboard resizing.');
if (!has('FavoritesSidebar') || !has('defaultFavorites')) throw new Error('Files panel must offer a Favorites sidebar with defaults.');
if (!has('useFilesTree') || !has('TREE_ROOT') || !has('files-tree-node')) throw new Error('Files panel must provide an expandable hierarchy tree.');
if (!has('preview.kind === "pdf"') || !has('React.createElement("iframe"')) throw new Error('PDF preview must render in an iframe, never as a video.');
if (!css.includes('.workbench-session .explorer-folders-view .monaco-icon-label::before')) throw new Error('Missing scoped Workbench file icon spacing fix.');
if (!css.includes('.monaco-tl-twistie + .monaco-tl-contents > .monaco-icon-label.folder-icon')) throw new Error('Missing scoped Workbench folder label spacing fix.');
if (!css.includes('.monaco-list-row[aria-level]:not([aria-level="1"]) .monaco-tl-twistie') || !css.includes('translateX(5px)')) throw new Error('Nested Workbench tree controls must clear their indent guides.');
if (!css.includes('.monaco-list-row[aria-level]:not([aria-level="1"]) .indent-guide') || !css.includes('translateX(-4px)')) throw new Error('Nested Workbench indent guides must remain offset from child controls.');
if (css.includes('.workbench-session .monaco-tl-twistie')) throw new Error('GearShell must not override Workbench disclosure geometry.');
if (!workbenchExtension.includes('bind #task/self/term/winch winch')) throw new Error('Workbench terminals must mount their resize signal through the task namespace.');
if (!workbenchExtension.includes('setDimensions: async (dimensions')) throw new Error('Workbench terminals must forward VS Code resize events.');
if (!has('window.GearShell')) throw new Error('Workspace API must be exposed to agents via window.GearShell (jsfs /js bridge).');
if (!has('initWorkspaceApi') || !has('GCTL_BIND')) throw new Error('Workspace API boot hook and gctl bind must exist for agent-side control.');
if (!has('app.js?v=20260828.26')) throw new Error('index.html must load the current app.js build.');

console.log('Static verification passed.');
