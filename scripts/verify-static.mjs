import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('app.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('app.css', root), 'utf8');
const workbenchExtension = readFileSync(new URL('wanix-workbench/dist/web/extension.js', root), 'utf8');

const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: app, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(syntax.stderr || 'app.js syntax check failed');

for (const marker of ['FilesPanel', 'RuntimePanel', 'LandingPanel', 'DeckPanel', 'WorkbenchPanel', 'VmPanel', "component: 'deck'", "component: 'workbench'", "component: 'vm'", 'value="import"', 'data-system="allow-origins"']) {
  if (!app.includes(marker) && !html.includes(marker)) throw new Error(`Missing expected feature marker: ${marker}`);
}
if (!app.includes("workbench.setAttribute('raw', '')")) throw new Error('Workbench terminals must forward raw input.');
if (!app.includes("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'")) throw new Error('Workbench must default to the bundled static assets.');
if (!app.includes('LEGACY_DEFAULT_WORKBENCH_ASSETS_URL')) throw new Error('Legacy Workbench asset defaults must migrate to the bundled assets.');
if (!app.includes('72141cb09a97b9a6f61461e9587ed8879ab08af1')) throw new Error('Workbench requires the runtime that synchronizes pane layout and terminal resize signals.');
if (!app.includes('LEGACY_WANIX_RUNTIME_MODULE_URLS')) throw new Error('Existing workspaces must migrate to the Workbench terminal runtime.');
if (!app.includes('71206477ae506f807b9893a8deca09749d212542')) throw new Error('The short-lived broken Workbench runtime must migrate automatically.');
if (!app.includes("window.dispatchEvent(new Event('resize'))")) throw new Error('Workbench panels must forward Dockview resize events.');
if (!app.includes("vm.setAttribute('netdev', session.config.netdev)")) throw new Error('VM panels must forward their saved network configuration.');
if (!app.includes("wisp,${wispUrl}")) throw new Error('VM settings must derive a Wisp netdev argument.');
if (!html.includes('data-config-value="vmWispUrl"')) throw new Error('Settings must expose the Wisp server URL.');
if (!html.includes('Workbench assets URL or path')) throw new Error('Workbench asset settings must accept local paths.');
if (!html.match(/src="app\.js\?v=[\d.]+"/)) throw new Error('index.html must cache-bust app.js');
if (!css.includes('.files-panel') || !css.includes('.runtime-panel')) throw new Error('Missing panel styles');
if (!css.includes('.workbench-session .explorer-folders-view .monaco-icon-label::before')) throw new Error('Missing scoped Workbench file icon spacing fix.');
if (!css.includes('.monaco-tl-twistie + .monaco-tl-contents > .monaco-icon-label.folder-icon')) throw new Error('Missing scoped Workbench folder label spacing fix.');
if (!css.includes('.monaco-list-row[aria-level]:not([aria-level="1"]) .monaco-tl-twistie') || !css.includes('translateX(5px)')) throw new Error('Nested Workbench tree controls must clear their indent guides.');
if (!css.includes('.monaco-list-row[aria-level]:not([aria-level="1"]) .indent-guide') || !css.includes('translateX(-4px)')) throw new Error('Nested Workbench indent guides must remain offset from child controls.');
if (css.includes('.workbench-session .monaco-tl-twistie')) throw new Error('GearShell must not override Workbench disclosure geometry.');
if (!workbenchExtension.includes('bind #task/self/term/winch winch')) throw new Error('Workbench terminals must mount their resize signal through the task namespace.');
if (!workbenchExtension.includes('setDimensions: async (dimensions')) throw new Error('Workbench terminals must forward VS Code resize events.');

console.log('Static verification passed.');
