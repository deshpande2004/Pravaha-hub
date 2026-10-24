// Writes site/offline-manifest.json: every app/icon file the service worker can serve offline.
// The desktop app asks the service worker to save them all, so every app works offline after one online launch.
// Run after changing anything under site/apps or site/icons:  node tools/gen-offline-manifest.mjs
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = new URL('../site/', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (!n.endsWith('.map')) files.push(relative(root, p).split('\\').join('/')); } };
walk(join(root, 'apps')); walk(join(root, 'icons'));
files.sort();
const out = [];
let bytes = 0;
const h = createHash('sha256');
for (const f of files) {
  const s = statSync(join(root, f)).size; bytes += s;
  h.update(f); h.update(readFileSync(join(root, f)));
  out.push(f);
  if (/(^|\/)index\.html$/.test(f)) out.push(f.replace(/index\.html$/, ''));
}
const json = { version: h.digest('hex').slice(0, 16), bytes, files: out };
writeFileSync(join(root, 'offline-manifest.json'), JSON.stringify(json));
console.log(`offline-manifest.json: ${out.length} entries, ${(bytes / 1048576).toFixed(1)} MB, version ${json.version}`);
