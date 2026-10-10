'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { APP_SCRIPT_FILES } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('index.html は js/01〜13 をこの順番で読み込み、古い app.js は読み込まない', () => {
  const srcs = Array.from(html.matchAll(/<script src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/g)).map(m => m[1]);
  assert.deepEqual(srcs, [...APP_SCRIPT_FILES, 'clinical-knowledge/patient-quality.js']);
  assert.doesNotMatch(html, /src="app\.js/);
});

test('各ファイルの版が index.html のファイルごとの版（app-file-versions）と同じ／版は中身が変わったファイルだけ上げる', () => {
  const expected = (html.match(/<meta name="app-version" content="([^"]*)">/) || [])[1];
  assert.ok(expected, 'index.html に版がある');
  const perFile = Object.fromEntries(((html.match(/<meta name="app-file-versions" content="([^"]*)">/) || [])[1] || '').split(',').map(p => p.split(':')));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'file-versions.json'), 'utf8'));
  APP_SCRIPT_FILES.forEach(f => {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = s.match(/\(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['(\d\d)'\] = '([^']*)'/);
    assert.ok(m, `${f} に版の行がある`);
    assert.equal(m[1], path.basename(f).slice(0, 2));
    assert.equal(m[2], perFile[m[1]], `${f} の版（index.html の app-file-versions）`);
    assert.ok(html.includes(`${f}?v=${m[2]}"`), `${f} の読み込みの ?v= もそのファイルの版`);
    assert.equal(manifest[f].version, m[2], `${f} の版（scripts/file-versions.json）`);
    assert.ok(m[2].localeCompare(expected, undefined, { numeric: true }) <= 0, `${f} の版は全体の版より新しくない`);
  });
  // HTML-only releases may keep every JavaScript asset at its previous version.
  // Verify the actual stamped contents rather than requiring an unrelated asset bump.
  const crypto = require('node:crypto');
  for (const file of APP_SCRIPT_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^    \(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '[^']*';.*\n/m, '').replace(/\r\n/g, '\n');
    const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0,16);
    assert.equal(manifest[file].hash, hash, file + ' content must match its version manifest');
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'js', '10-reference-page-and-startup.js'), 'utf8'), /versions\[id\] !== \(perFile\[id\] \|\| expected\)/);
});

test('ネット上の Tailwind（cdn.tailwindcss.com）を使わず、同梱の CSS を読み込む（改善提案7）', () => {
  assert.doesNotMatch(html, /<script[^>]+cdn\.tailwindcss\.com/);
  assert.match(html, /href="vendor\/tailwind\.css/);
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'tailwind.css')));
  assert.doesNotMatch(html, /<link[^>]+cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/);
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'fontawesome', 'css', 'all.min.css')));
});
