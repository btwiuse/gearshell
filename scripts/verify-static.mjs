import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('app.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('app.css', root), 'utf8');
// Per-feature modules extracted from app.js / index.html / app.css. The
// static checks below look for feature markers; if a marker used to live
// inline but has moved into one of these modules we still want to find
// it, so include them in the search corpus.
const settings = readFileSync(new URL('settings.js', root), 'utf8');
const settingsCss = readFileSync(new URL('settings.css', root), 'utf8');
const workbenchExtension = readFileSync(new URL('wanix-workbench/dist/web/extension.js', root), 'utf8');

const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: app, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(syntax.stderr || 'app.js syntax check failed');

for (const marker of ['FilesPanel', 'RuntimePanel', 'LandingPanel', 'DeckPanel', 'WorkbenchPanel', 'VmPanel', "component: 'deck'", "component: 'workbench'", "component: 'vm'", 'value="import"', 'data-system="allow-origins"']) {
  if (!app.includes(marker) && !html.includes(marker) && !settings.includes(marker) && !settingsCss.includes(marker)) throw new Error(`Missing expected feature marker: ${marker}`);
}
if (!app.includes("workbench.setAttribute('raw', '')")) throw new Error('Workbench terminals must forward raw input.');
if (!app.includes("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'") && !settings.includes("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'") && !settingsCss.includes("DEFAULT_WORKBENCH_ASSETS_URL = '/wanix-workbench'")) throw new Error('Workbench must default to the bundled static assets.');
if (!app.includes('LEGACY_DEFAULT_WORKBENCH_ASSETS_URL') && !settings.includes('LEGACY_DEFAULT_WORKBENCH_ASSETS_URL') && !settingsCss.includes('LEGACY_DEFAULT_WORKBENCH_ASSETS_URL')) throw new Error('Legacy Workbench asset defaults must migrate to the bundled assets.');
if (!app.includes('4541e4ca6d7a6c07dd2b0538cf27e1fe5335e1a4') && !settings.includes('4541e4ca6d7a6c07dd2b0538cf27e1fe5335e1a4') && !settingsCss.includes('4541e4ca6d7a6c07dd2b0538cf27e1fe5335e1a4')) throw new Error('Workbench must report that VS Code supports only one instance per page.');
if (!app.includes("panel.id.startsWith('workbench-')")) throw new Error('GearShell must focus the existing singleton Workbench panel.');
if (!app.includes('976020821b1a7a09a13c6e8034a41686a69c12df') && !settings.includes('976020821b1a7a09a13c6e8034a41686a69c12df') && !settingsCss.includes('976020821b1a7a09a13c6e8034a41686a69c12df')) throw new Error('Existing workspaces must migrate from the prior Workbench loader runtime.');
if (!app.includes('72141cb09a97b9a6f61461e9587ed8879ab08af1') && !settings.includes('72141cb09a97b9a6f61461e9587ed8879ab08af1') && !settingsCss.includes('72141cb09a97b9a6f61461e9587ed8879ab08af1')) throw new Error('Existing workspaces must migrate from the prior Workbench runtime.');
if (!app.includes('LEGACY_WANIX_RUNTIME_MODULE_URLS') && !settings.includes('LEGACY_WANIX_RUNTIME_MODULE_URLS') && !settingsCss.includes('LEGACY_WANIX_RUNTIME_MODULE_URLS')) throw new Error('Existing workspaces must migrate to the Workbench terminal runtime.');
if (!app.includes('LEGACY_WANIX_RUNTIME_WASM_URLS') && !settings.includes('LEGACY_WANIX_RUNTIME_WASM_URLS') && !settingsCss.includes('LEGACY_WANIX_RUNTIME_WASM_URLS')) throw new Error('Existing workspaces must migrate to the multiline-argv kernel runtime.');
if (!app.includes('7111a7b9fb6f192af61498844354d1c758376b2d') && !settings.includes('7111a7b9fb6f192af61498844354d1c758376b2d') && !settingsCss.includes('7111a7b9fb6f192af61498844354d1c758376b2d')) throw new Error('Wanix runtime must preserve multiline task arguments.');
if (!app.includes('71206477ae506f807b9893a8deca09749d212542') && !settings.includes('71206477ae506f807b9893a8deca09749d212542') && !settingsCss.includes('71206477ae506f807b9893a8deca09749d212542')) throw new Error('The short-lived broken Workbench runtime must migrate automatically.');
if (!app.includes("window.dispatchEvent(new Event('resize'))")) throw new Error('Workbench panels must forward Dockview resize events.');
if (!app.includes("vm.setAttribute('netdev', session.config.netdev)")) throw new Error('VM panels must forward their saved network configuration.');
if (!app.includes('DEFAULT_COLLAPSED_LAUNCHER_ITEMS') && !settings.includes('DEFAULT_COLLAPSED_LAUNCHER_ITEMS') && !settingsCss.includes('DEFAULT_COLLAPSED_LAUNCHER_ITEMS')) throw new Error('Launcher needs configurable default collapsed items.');
if (!app.includes('launcher-more-toggle') && !settings.includes('launcher-more-toggle') && !settingsCss.includes('launcher-more-toggle')) throw new Error('Launcher needs a More control for collapsed items.');
if (!app.includes('DEFAULT_LAUNCHER_ITEM_ORDER') && !settings.includes('DEFAULT_LAUNCHER_ITEM_ORDER') && !settingsCss.includes('DEFAULT_LAUNCHER_ITEM_ORDER') || !app.includes('normalizeLauncherOrder') && !settings.includes('normalizeLauncherOrder') && !settingsCss.includes('normalizeLauncherOrder')) throw new Error('Launcher must persist a complete item order.');
if (!html.includes('data-config-launcher-order') && !settings.includes('data-config-launcher-order') && !settingsCss.includes('data-config-launcher-order')) throw new Error('Settings must expose Launcher item ordering.');
if (!app.includes('function LauncherOrderEditor') && !settings.includes('function LauncherOrderEditor')) throw new Error('Launcher layout must combine ordering and visibility controls.');
if (!app.includes('setCollapsed') && !settings.includes('setCollapsed')) throw new Error('Launcher layout must combine ordering and visibility controls.');
if (!app.includes('onDragStart:') && !settings.includes('onDragStart:') && !settingsCss.includes('onDragStart:') || !app.includes('EyeOff') && !settings.includes('EyeOff') && !settingsCss.includes('EyeOff') || !app.includes('Open by default') && !settings.includes('Open by default') && !settingsCss.includes('Open by default')) throw new Error('Launcher layout must support drag, visibility icons, and default startup.');
if (!app.includes("src: '/bonsai/'") && !settings.includes("src: '/bonsai/'") && !settingsCss.includes("src: '/bonsai/'") || !app.includes("label: 'Bonsai 27B'") && !settings.includes("label: 'Bonsai 27B'") && !settingsCss.includes("label: 'Bonsai 27B'")) throw new Error('Launcher must offer Bonsai 27B from the bundled Bonsai app.');
if (!app.includes('DEFAULT_LAUNCHER_ITEM_ORDER') && !settings.includes('DEFAULT_LAUNCHER_ITEM_ORDER') && !settingsCss.includes('DEFAULT_LAUNCHER_ITEM_ORDER') || !app.includes("'bonsai'") && !settings.includes("'bonsai'") && !settingsCss.includes("'bonsai'")) throw new Error('Launcher layout must include Bonsai 27B.');
if (!app.includes("import WebPet from './web-pet/index.js'") && !settings.includes("import WebPet from './web-pet/index.js'") && !settingsCss.includes("import WebPet from './web-pet/index.js'")) throw new Error('Wagi Dog must use the bundled web-pet runtime.');
if (!app.includes('new WebPet()')) throw new Error('GearShell must start the Wagi Dog web pet when enabled.');
if (!html.includes('href="web-pet/web-pet.css"') && !settings.includes('href="web-pet/web-pet.css"') && !settingsCss.includes('href="web-pet/web-pet.css"')) throw new Error('GearShell must load the web-pet stylesheet.');
if (!app.includes('wagiDogEnabled: config?.wagiDogEnabled !== false') && !settings.includes('wagiDogEnabled: config?.wagiDogEnabled !== false') && !settingsCss.includes('wagiDogEnabled: config?.wagiDogEnabled !== false')) throw new Error('Wagi Dog must default to enabled for existing workspaces.');
if (!html.includes('data-config="wagi-dog-enabled"') && !settings.includes('data-config="wagi-dog-enabled"') && !settingsCss.includes('data-config="wagi-dog-enabled"')) throw new Error('Settings must expose the Wagi Dog toggle.');
if (!app.includes("'aria-checked': wagiDogEnabled") && !settings.includes("'aria-checked': wagiDogEnabled") && !settingsCss.includes("'aria-checked': wagiDogEnabled")) throw new Error('The panel menu must expose the Wagi Dog toggle.');
if (!app.includes('TERMINAL_PRESET_ICON_OPTIONS') && !settings.includes('TERMINAL_PRESET_ICON_OPTIONS') && !settingsCss.includes('TERMINAL_PRESET_ICON_OPTIONS')) throw new Error('Terminal presets need configurable Lucide icons.');
if (!html.includes('data-terminal-profile-editor') && !settings.includes('data-terminal-profile-editor') && !settingsCss.includes('data-terminal-profile-editor')) throw new Error('Settings must expose the Terminal preset editor.');
if (!app.includes('icons as LucideIcons') || !app.includes('Object.entries(LucideIcons)')) throw new Error('Terminal preset icons must cover the complete Lucide catalog.');
if (!app.includes('TerminalPresetIconPicker') && !settings.includes('TerminalPresetIconPicker') && !settingsCss.includes('TerminalPresetIconPicker') || !app.includes('terminal-profile-icon-catalog') && !settings.includes('terminal-profile-icon-catalog') && !settingsCss.includes('terminal-profile-icon-catalog') || !app.includes('terminal-profile-icon-pagination') && !settings.includes('terminal-profile-icon-pagination') && !settingsCss.includes('terminal-profile-icon-pagination')) throw new Error('Terminal preset icons need a searchable, paginated picker.');
if (!app.includes('catalogColumns * 3') || !app.includes('ResizeObserver(updateColumns)')) throw new Error('Terminal preset paging must fill three responsive icon rows.');
if (!app.includes('terminalProfileOrder') && !settings.includes('terminalProfileOrder') && !settingsCss.includes('terminalProfileOrder') || !app.includes('function normalizeTerminalProfileOrder') && !settings.includes('function normalizeTerminalProfileOrder') && !settingsCss.includes('function normalizeTerminalProfileOrder')) throw new Error('Terminal presets need persisted ordering.');
if (!app.includes('terminal-profile-handle') && !settings.includes('terminal-profile-handle') && !settingsCss.includes('terminal-profile-handle') || !app.includes('onDragStart:') && !settings.includes('onDragStart:') && !settingsCss.includes('onDragStart:')) throw new Error('Terminal presets need drag reorder controls.');
if (!app.includes("user,type=virtio,relay_url=${wispUrl}") && !settings.includes("user,type=virtio,relay_url=${wispUrl}") && !settingsCss.includes("user,type=virtio,relay_url=${wispUrl}")) throw new Error('VM settings must derive v86\'s native Wisp relay argument.');
if (!app.includes("user,type=virtio,relay_url=fetch") && !settings.includes("user,type=virtio,relay_url=fetch") && !settingsCss.includes("user,type=virtio,relay_url=fetch")) throw new Error('VM settings must derive v86\'s native fetch relay argument.');
if (!html.includes('data-config-value="vmWispUrl"') && !settings.includes('data-config-value="vmWispUrl"') && !settingsCss.includes('data-config-value="vmWispUrl"')) throw new Error('Settings must expose the Wisp server URL.');
if (!app.includes('wanix-extras@0.4.0-rc2/dist/v86.tgz') && !settings.includes('wanix-extras@0.4.0-rc2/dist/v86.tgz') && !settingsCss.includes('wanix-extras@0.4.0-rc2/dist/v86.tgz')) throw new Error('VMs must default to the public v86 archive with built-in Wisp support.');
if (!app.includes('REDUNDANT_WISP_VM_BACKEND_URL') && !settings.includes('REDUNDANT_WISP_VM_BACKEND_URL') && !settingsCss.includes('REDUNDANT_WISP_VM_BACKEND_URL')) throw new Error('Existing workspaces must migrate away from the redundant custom v86 archive.');
if (!html.includes('Workbench assets URL or path') && !settings.includes('Workbench assets URL or path') && !settingsCss.includes('Workbench assets URL or path')) throw new Error('Workbench asset settings must accept local paths.');
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
