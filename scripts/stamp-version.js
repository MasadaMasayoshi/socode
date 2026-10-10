'use strict';
// Stamp changed asset hashes/cache versions; preserve unchanged versions.
// ------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { APP_SCRIPT_FILES } = require('../tests/app-helpers');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const version = process.argv[2] || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
if (!/^[\w.-]{1,40}$/.test(version)) throw new Error('版には英数字・ピリオド・ハイフンだけを使ってください');

const MARK_REGEX = /^    \(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '[^']*';.*\n/m;
const MARK_VERSION = /\(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '([^']*)'/;

// Fingerprints exclude the stamp line; startup compares per-file versions.
const crypto = require('crypto');
const MANIFEST = path.join(ROOT, 'scripts', 'file-versions.json');
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const fingerprint = s => crypto.createHash('sha1').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const all = process.argv.includes('--all'); // --all forces every asset version.
const fileVersions = {};
const changed = [];

APP_SCRIPT_FILES.forEach(rel => {
  const file = path.join(ROOT, rel);
  let s = fs.readFileSync(file, 'utf8');
  const id = path.basename(rel).slice(0, 2);
  const fp = fingerprint(s.replace(MARK_REGEX, ''));
  const current = (s.match(MARK_VERSION) || [])[1];
  const prev = manifest[rel];
  const same = !all && current && prev && prev.hash === fp && prev.version === current;
  const v = same ? current : version;
  if (!same) {
    const line = `    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['${id}'] = '${v}'; // 版（scripts/stamp-version.js が書き込む）\n`;
    if (MARK_REGEX.test(s)) s = s.replace(MARK_REGEX, line);
    else {
      // Insert after the opening description.
      const i = s.indexOf('\n\n');
      s = s.slice(0, i + 2) + line + s.slice(i + 2);
    }
    fs.writeFileSync(file, s);
    changed.push(rel);
  }
  manifest[rel] = { version: v, hash: fp };
  fileVersions[id] = v;
});

// CSS content stays unchanged; update only its HTML cache key.
const CSS_FILES = ['style.css', 'vendor/tailwind.css', 'vendor/fontawesome/css/all.min.css'];
const cssVersions = {};
CSS_FILES.forEach(rel => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return;
  const fp = fingerprint(fs.readFileSync(file, 'utf8'));
  const prev = manifest[rel];
  const same = !all && prev && prev.hash === fp;
  cssVersions[rel] = same ? prev.version : version;
  if (!same) changed.push(rel);
  manifest[rel] = { version: cssVersions[rel], hash: fp };
});

const htmlFile = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
html = html.replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`);
const fvText = Object.keys(fileVersions).sort().map(id => `${id}:${fileVersions[id]}`).join(',');
if (/<meta name="app-file-versions" content="[^"]*">/.test(html)) html = html.replace(/<meta name="app-file-versions" content="[^"]*">/, `<meta name="app-file-versions" content="${fvText}">`);
else html = html.replace(/(<meta name="app-version" content="[^"]*">)/, `$1\n  <meta name="app-file-versions" content="${fvText}">`);
html = html.replace(/((?:src|href)=")(js\/[\w-]+\.js|style\.css|vendor\/[\w./-]+\.css)(?:\?v=[\w.-]*)?"/g, (m, pre, rel) => {
  const v = rel.startsWith('js/') ? fileVersions[path.basename(rel).slice(0, 2)] : cssVersions[rel];
  return `${pre}${rel}?v=${v || version}"`;
});
fs.writeFileSync(htmlFile, html);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`版 ${version} を書き込みました。版を上げたファイル：${changed.length ? changed.join('、') : '（なし。index.html だけ）'}`);
