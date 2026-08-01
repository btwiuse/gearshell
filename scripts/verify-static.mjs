import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('app.js', root), 'utf8');
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('app.css', root), 'utf8');

const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: app, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(syntax.stderr || 'app.js syntax check failed');

for (const marker of ['FilesPanel', 'RuntimePanel', 'LandingPanel', 'DeckPanel', "component: 'deck'", 'value="import"', 'data-system="allow-origins"']) {
  if (!app.includes(marker) && !html.includes(marker)) throw new Error(`Missing expected feature marker: ${marker}`);
}
if (!html.match(/src="app\.js\?v=[\d.]+"/)) throw new Error('index.html must cache-bust app.js');
if (!css.includes('.files-panel') || !css.includes('.runtime-panel')) throw new Error('Missing panel styles');

console.log('Static verification passed.');
