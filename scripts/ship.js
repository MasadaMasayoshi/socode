'use strict';
// Copy files changed since the delivery baseline, normalizing source files to CRLF.
// node scripts/ship.js <output>: copy changes and update the baseline.
// node scripts/ship.js --list: list changes without writes.
// node scripts/ship.js --baseline: record the current delivery baseline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'scripts', '.ship-manifest.json');
const TARGETS = [/^js\/[^/]+\.js$/, /^style\.css$/, /^index\.html$/, /^server\.js$/, /^package\.json$/, /^README\.md$/, /^scripts\/[^/]+\.(js|md|json|ps1)$/, /^tests\/[^/]+\.js$/];
const CRLF_EXT = /\.(js|css|html)$/;
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' || e.name === 'fixtures' || e.name === 'golden' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name).replace(/\\/g, '/')]);
const all = ['.', 'js', 'scripts', 'tests'].flatMap(d => d === '.' ? fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()) : walk(d))
  .filter(f => TARGETS.some(t => t.test(f)));
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const now = Object.fromEntries(all.map(f => [f, hash(f)]));
const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const arg = process.argv[2];
if (arg === '--baseline') { fs.writeFileSync(MANIFEST, JSON.stringify(now, null, 1)); console.log('Baseline recorded (' + all.length + ' files)'); process.exit(0); }
const changed = all.filter(f => prev[f] !== now[f] && f !== 'scripts/.ship-manifest.json');
if (!changed.length) { console.log('No changed files'); process.exit(0); }
if (arg && arg !== '--list') {
  for (const f of changed) {
    const dst = path.join(arg, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    let t = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(dst, CRLF_EXT.test(f) ? t.replace(/\n/g, '\r\n') : t);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(now, null, 1));
}
console.log(changed.length + ' files:\n' + changed.join('\n'));
