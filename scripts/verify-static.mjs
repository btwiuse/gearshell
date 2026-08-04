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
if (!app.includes('4541e4ca6d7a6c07dd2b0538cf27e1fe5335e1a4')) throw new Error('Workbench must report that VS Code supports only one instance per page.');
if (!app.includes("panel.id.startsWith('workbench-')")) throw new Error('GearShell must focus the existing singleton Workbench panel.');
if (!app.includes('976020821b1a7a09a13c6e8034a41686a69c12df')) throw new Error('Existing workspaces must migrate from the prior Workbench loader runtime.');
if (!app.includes('72141cb09a97b9a6f61461e9587ed8879ab08af1')) throw new Error('Existing workspaces must migrate from the prior Workbench runtime.');
if (!app.includes('LEGACY_WANIX_RUNTIME_MODULE_URLS')) throw new Error('Existing workspaces must migrate to the Workbench terminal runtime.');
if (!app.includes('LEGACY_WANIX_RUNTIME_WASM_URLS')) throw new Error('Existing workspaces must migrate to the multiline-argv kernel runtime.');
if (!app.includes('7111a7b9fb6f192af61498844354d1c758376b2d')) throw new Error('Wanix runtime must preserve multiline task arguments.');
if (!app.includes('71206477ae506f807b9893a8deca09749d212542')) throw new Error('The short-lived broken Workbench runtime must migrate automatically.');
if (!app.includes("window.dispatchEvent(new Event('resize'))")) throw new Error('Workbench panels must forward Dockview resize events.');
if (!app.includes("vm.setAttribute('netdev', session.config.netdev)")) throw new Error('VM panels must forward their saved network configuration.');
if (!app.includes('DEFAULT_COLLAPSED_LAUNCHER_ITEMS')) throw new Error('Launcher needs configurable default collapsed items.');
if (!app.includes('launcher-more-toggle')) throw new Error('Launcher needs a More control for collapsed items.');
if (!html.includes('data-config-launcher-collapse')) throw new Error('Settings must expose Launcher item collapse controls.');
if (!app.includes("src: '/bonsai/'") || !app.includes("label: 'Bonsai 27B'")) throw new Error('Launcher must offer Bonsai 27B from the bundled Bonsai app.');
if (!html.includes('value="bonsai"')) throw new Error('Settings must expose Bonsai 27B startup and Launcher-collapse controls.');
if (!app.includes('function WagiDogPet') || !css.includes("url('/wagi-dog/spritesheet.webp')")) throw new Error('GearShell must render the bundled Wagi Dog pet.');
if (!app.includes('WAGI_DOG_IDLE_FRAME_DURATIONS') || app.includes('WAGI_DOG_FRAME_DURATION')) throw new Error('Wagi Dog must use only the populated idle frames.');
if (!app.includes('wagiDogEnabled: config?.wagiDogEnabled !== false')) throw new Error('Wagi Dog must default to enabled for existing workspaces.');
if (!html.includes('data-config="wagi-dog-enabled"')) throw new Error('Settings must expose the Wagi Dog toggle.');
if (!app.includes("'aria-checked': wagiDogEnabled")) throw new Error('The panel menu must expose the Wagi Dog toggle.');
if (!app.includes('TERMINAL_PRESET_ICON_OPTIONS')) throw new Error('Terminal presets need configurable Lucide icons.');
if (!html.includes('data-terminal-profile="icon"')) throw new Error('Settings must expose Terminal preset icon controls.');
if (!app.includes("user,type=virtio,relay_url=${wispUrl}")) throw new Error('VM settings must derive v86\'s native Wisp relay argument.');
if (!app.includes("user,type=virtio,relay_url=fetch")) throw new Error('VM settings must derive v86\'s native fetch relay argument.');
if (!html.includes('data-config-value="vmWispUrl"')) throw new Error('Settings must expose the Wisp server URL.');
if (!app.includes('wanix-extras@0.4.0-rc2/dist/v86.tgz')) throw new Error('VMs must default to the public v86 archive with built-in Wisp support.');
if (!app.includes('REDUNDANT_WISP_VM_BACKEND_URL')) throw new Error('Existing workspaces must migrate away from the redundant custom v86 archive.');
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
